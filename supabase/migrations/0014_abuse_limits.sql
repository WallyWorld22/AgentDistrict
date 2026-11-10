-- =============================================================================
-- AgentDistrict — 0014: limits and abuse guards
--
-- Three changes, each closing a hole the site audit confirmed:
--
--   1. `register_agent()` becomes server-only (sec-03, owner decision 3).
--      0009 and 0011 left EXECUTE with `anon` and `authenticated` because both
--      entrances called it through the cookie-bound anon-key client. That
--      meant anyone holding the public anon key could call it straight through
--      PostgREST and mint Passports and API keys without limit, skipping the
--      app's per-IP budget (`RATE_BUDGETS.register`). The app now calls it
--      through the service-role client (`lib/data/supabase` `registerAgent`),
--      after the same rate limit as before, so EXECUTE is revoked from
--      `public`, `anon` and `authenticated` and kept for `service_role` only.
--      The function body is unchanged.
--
--   2. `top_up_wallet()` is capped and its ledger text fixed (economy-01,
--      owner decision 2, a stopgap until real payments exist). Any signed-in
--      user could add any amount to their own wallet and choose the memo the
--      ledger shows. Now:
--        * at most 10000 cents ($100.00) per top-up,
--        * at most 50000 cents ($500.00) per profile per UTC day, summed over
--          that day's `topup` rows with the wallet row locked, so two
--          concurrent top-ups cannot both slip under the cap,
--        * the memo is always 'Demo credits added — not real money';
--          `p_memo` stays in the signature (so grants and callers resolve to
--          the same function) and is ignored.
--      The numbers match `lib/data/limits.ts`, which the demo adapter uses.
--      Refusals raise SQLSTATE 22023 with a 'top-up cap: …' message the
--      adapter turns into a plain sentence.
--
--   3. `increment_gig_runs()` counts approved runs only (gigs-orders-03). A
--      gig's public "Runs" count (and the Trending sort built on it) moved on
--      every order — self-orders and free orders included. It now moves only
--      for an order the caller bought that has been approved, still once per
--      order (`reputation_bumps`), and the adapter calls it from
--      `approveOrder` instead of `orderGig`.
--
-- Re-runnable: `create or replace` with unchanged signatures and idempotent
-- grants. Applies after 0001–0013 and the seed, and again on top of itself.
-- =============================================================================

-- =============================================================================
-- 1. register_agent — service role only
-- =============================================================================

revoke execute on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) to service_role;

comment on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) is
  'The front door, server-side only (0014): create a Passport owned by the '
  'District registry, a scoped API key bound to it and a one-shot claim link, '
  'in one transaction. Callable by service_role alone; the app reaches it after '
  'its per-IP rate limit. The holding profile is fixed; p_registry_handle is '
  'accepted only as null, '''' or ''district-registry''.';

-- =============================================================================
-- 2. top_up_wallet — capped, with a fixed memo
-- =============================================================================

create or replace function public.top_up_wallet(
  p_amount integer,
  p_memo   text default 'Added credits',
  p_actor  uuid default null
)
returns public.wallets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet    public.wallets;
  v_uid       uuid := public.acting_uid(p_actor);
  v_today     bigint;
  c_per_topup constant integer := 10000;
  c_per_day   constant integer := 50000;
begin
  if v_uid is null then
    raise exception 'top_up_wallet requires an authenticated caller' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'top-up must be greater than zero' using errcode = '22023';
  end if;
  if p_amount > c_per_topup then
    raise exception 'top-up cap: per top-up, at most % cents', c_per_topup
      using errcode = '22023';
  end if;

  -- Lock the wallet first: the daily sum below must not race another top-up.
  select * into v_wallet from public.wallets w where w.profile_id = v_uid for update;
  if not found then
    raise exception 'wallet not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(t.amount_cents), 0) into v_today
    from public.wallet_transactions t
   where t.profile_id = v_uid
     and t.kind = 'topup'
     and t.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  if v_today + p_amount > c_per_day then
    raise exception 'top-up cap: daily, % left', greatest(c_per_day - v_today, 0)
      using errcode = '22023';
  end if;

  update public.wallets w
     set balance_cents = w.balance_cents + p_amount,
         updated_at = now()
   where w.profile_id = v_uid
   returning * into v_wallet;

  insert into public.wallet_transactions (profile_id, kind, amount_cents, order_id, memo)
  values (v_uid, 'topup', p_amount, null, 'Demo credits added — not real money');

  return v_wallet;
end;
$$;

comment on function public.top_up_wallet(integer, text, uuid) is
  'Demo credits only (0014): at most $100.00 per top-up and $500.00 per profile '
  'per UTC day; the ledger memo is fixed and p_memo is ignored.';

-- `create or replace` keeps the ACL; re-assert 0007's grants.
revoke execute on function public.top_up_wallet(integer, text, uuid) from public, anon;
grant execute on function public.top_up_wallet(integer, text, uuid) to authenticated, service_role;

-- =============================================================================
-- 3. increment_gig_runs — approved runs only
-- =============================================================================

create or replace function public.increment_gig_runs(
  p_gig_id   uuid,
  p_order_id uuid,
  p_actor    uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
  v_uid     uuid := public.acting_uid(p_actor);
begin
  if v_uid is null then
    raise exception 'increment_gig_runs requires an authenticated caller'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.gig_id = p_gig_id
       and o.buyer_id = v_uid
       and o.status = 'approved'
  ) then
    raise exception 'no order by this caller for that gig has been approved'
      using errcode = '42501';
  end if;

  insert into public.reputation_bumps (order_id, kind)
  values (p_order_id, 'gig_run')
  on conflict do nothing;
  if not found then
    select g.runs_count into new_count from public.gigs g where g.id = p_gig_id;
    return new_count;
  end if;

  update public.gigs
     set runs_count = runs_count + 1
   where id = p_gig_id
  returning runs_count into new_count;

  return new_count;
end;
$$;

revoke execute on function public.increment_gig_runs(uuid, uuid, uuid) from public, anon;
grant execute on function public.increment_gig_runs(uuid, uuid, uuid) to authenticated, service_role;
