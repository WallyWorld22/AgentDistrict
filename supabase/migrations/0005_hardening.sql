-- =============================================================================
-- AgentDistrict — 0005_hardening
--
-- Closes the gaps that made the Postgres adapter behave differently from the
-- demo adapter, and the ones that let a browser holding the *public* anon key
-- rewrite money and reputation directly.
--
-- Three groups:
--
--  1. **Money is server-side.** `wallets.balance_cents` / `held_cents` and the
--     state columns of `orders` are revoked at column level from
--     `authenticated`; every balance change now goes through a SECURITY DEFINER
--     function that re-checks the caller and the invariants. A row-level policy
--     cannot express "you may edit your own wallet but not its balance", which
--     is why this has to be a column grant plus an RPC.
--  2. **Event writes.** Marketplace lifecycle events name the *agent* as actor
--     but are written by the buyer, who does not own that agent, so a direct
--     insert is (correctly) refused by `events_insert_authenticated` and every
--     hire/award/delivery 500s. `publish_event()` writes them for participants.
--  3. **Reputation.** A reviewer is not the agent's owner, so the incremental
--     `rating_avg` update in `createReview` silently matched zero rows.
--     `apply_review_rating()` does it, incrementally — never by recomputing
--     from `reviews`, which would collapse the seeded lifetime counters.
--
-- Re-runnable: every function is `create or replace`, every policy is dropped
-- first, and the grants are idempotent.
-- =============================================================================

-- =============================================================================
-- 1. Column-level lockdown
-- =============================================================================

revoke update (balance_cents, held_cents, spend_today_cents)
  on public.wallets from authenticated;

revoke update (amount_cents, status, progress, cost_breakdown, output, buyer_id, agent_id)
  on public.orders from authenticated;

-- Reputation counters are never client-writable; they move through
-- `apply_review_rating()` / `increment_agent_jobs()`.
revoke update (rating_avg, rating_count, jobs_completed)
  on public.agents from authenticated;

revoke update (rating_avg, rating_count, runs_count)
  on public.gigs from authenticated;

-- =============================================================================
-- 2. publish_event — lifecycle events written on behalf of an agent
-- =============================================================================

create or replace function public.publish_event(
  p_kind        text,
  p_actor_type  text,
  p_actor_id    uuid,
  p_actor_name  text,
  p_headline    text,
  p_body        text,
  p_cta_label   text default null,
  p_cta_href    text default null
)
returns public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
begin
  if auth.uid() is null then
    raise exception 'publish_event requires an authenticated caller'
      using errcode = '42501';
  end if;

  -- A human event may only ever be attributed to the caller themselves. Agent
  -- and system events are open to any signed-in caller because that is exactly
  -- the marketplace case (the buyer records "@scout delivered a run"); the
  -- headline/body are already server-composed by the repository.
  if p_actor_type = 'human' and p_actor_id is distinct from auth.uid() then
    raise exception 'cannot publish a human event for another profile'
      using errcode = '42501';
  end if;

  insert into public.events (
    kind, actor_type, actor_id, actor_name, headline, body, cta_label, cta_href
  )
  values (
    p_kind::public.event_kind,
    p_actor_type::public.author_type,
    p_actor_id,
    p_actor_name,
    p_headline,
    p_body,
    p_cta_label,
    p_cta_href
  )
  returning * into v_event;

  return v_event;
end;
$$;

-- =============================================================================
-- 3. apply_review_rating — incremental reputation update
-- =============================================================================

create or replace function public.apply_review_rating(
  p_agent_id uuid,
  p_rating   integer,
  p_gig_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_avg   numeric(3,2);
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'apply_review_rating requires an authenticated caller'
      using errcode = '42501';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;
  -- Only a reviewer who actually wrote a review for this agent may move it.
  if not exists (
    select 1 from public.reviews r
    where r.agent_id = p_agent_id and r.reviewer_id = auth.uid()
  ) then
    raise exception 'no review by this caller for that agent' using errcode = '42501';
  end if;

  update public.agents a
     set rating_avg = round(
           ((a.rating_avg * a.rating_count + p_rating) / (a.rating_count + 1))::numeric, 2
         )::numeric(3,2),
         rating_count = a.rating_count + 1
   where a.id = p_agent_id
   returning a.rating_avg, a.rating_count into v_avg, v_count;

  if p_gig_id is not null then
    update public.gigs g
       set rating_avg = round(
             ((g.rating_avg * g.rating_count + p_rating) / (g.rating_count + 1))::numeric, 2
           )::numeric(3,2),
           rating_count = g.rating_count + 1
     where g.id = p_gig_id;
  end if;

  return jsonb_build_object('rating_avg', v_avg, 'rating_count', v_count);
end;
$$;

-- =============================================================================
-- 4. Wallet money movement
-- =============================================================================

-- Hold funds against the caller's own wallet and write the ledger row.
-- Enforces available = balance − held, the Workplace Gateway approval
-- threshold and the autonomous daily spend limit (BUILD_SPEC §2/§4).
create or replace function public.hold_funds(
  p_order_id uuid,
  p_amount   integer,
  p_memo     text,
  p_approved boolean default false
)
returns public.wallets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet    public.wallets;
  v_available integer;
  v_spent     integer;
begin
  if auth.uid() is null then
    raise exception 'hold_funds requires an authenticated caller' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'hold amount must be positive' using errcode = '22023';
  end if;

  select * into v_wallet from public.wallets w
   where w.profile_id = auth.uid() for update;
  if not found then
    raise exception 'wallet not found' using errcode = 'P0002';
  end if;

  -- A new UTC day resets the autonomous spend counter.
  v_spent := case
    when v_wallet.updated_at::date < (now() at time zone 'utc')::date then 0
    else v_wallet.spend_today_cents
  end;

  v_available := v_wallet.balance_cents - v_wallet.held_cents;
  if p_amount > v_available then
    raise exception 'insufficient funds: % available, % requested', v_available, p_amount
      using errcode = '22003';
  end if;

  if not p_approved
     and v_wallet.approval_threshold_cents > 0
     and p_amount > v_wallet.approval_threshold_cents then
    raise exception 'approval required: % exceeds the % approval threshold',
      p_amount, v_wallet.approval_threshold_cents using errcode = '22023';
  end if;

  if v_wallet.autonomous_spend_limit_cents > 0
     and v_spent + p_amount > v_wallet.autonomous_spend_limit_cents then
    raise exception 'daily autonomous spend limit reached' using errcode = '22023';
  end if;

  update public.wallets w
     set held_cents = w.held_cents + p_amount,
         spend_today_cents = v_spent + p_amount
   where w.profile_id = auth.uid()
   returning * into v_wallet;

  insert into public.wallet_transactions (profile_id, kind, amount_cents, order_id, memo)
  values (auth.uid(), 'hold', -p_amount, p_order_id, p_memo);

  return v_wallet;
end;
$$;

-- Settle a hold. `p_refund` returns the money to the buyer (dispute / failed
-- run) instead of paying it out; either way the single money-out ledger row for
-- the order is rewritten rather than a second one being added, so the wallet
-- page never double-counts.
create or replace function public.settle_hold(
  p_order_id uuid,
  p_memo     text,
  p_refund   boolean default false
)
returns public.wallets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order  public.orders;
  v_wallet public.wallets;
  v_amount integer;
begin
  if auth.uid() is null then
    raise exception 'settle_hold requires an authenticated caller' using errcode = '42501';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id is distinct from auth.uid() then
    raise exception 'only the buyer can settle this hold' using errcode = '42501';
  end if;

  v_amount := v_order.amount_cents;

  update public.wallets w
     set held_cents   = greatest(0, w.held_cents - v_amount),
         balance_cents = case
           when p_refund then w.balance_cents
           else greatest(0, w.balance_cents - v_amount)
         end
   where w.profile_id = v_order.buyer_id
   returning * into v_wallet;

  update public.wallet_transactions t
     set kind = (case when p_refund then 'refund' else 'release' end)::public.transaction_kind,
         amount_cents = case when p_refund then v_amount else -v_amount end,
         memo = p_memo
   where t.order_id = p_order_id
     and t.profile_id = v_order.buyer_id
     and t.kind = 'hold';

  if not found then
    insert into public.wallet_transactions (profile_id, kind, amount_cents, order_id, memo)
    values (
      v_order.buyer_id,
      (case when p_refund then 'refund' else 'release' end)::public.transaction_kind,
      case when p_refund then v_amount else -v_amount end,
      p_order_id,
      p_memo
    );
  end if;

  return v_wallet;
end;
$$;

-- Demo/manual top-up. Credits only ever the caller's own wallet.
create or replace function public.top_up_wallet(p_amount integer, p_memo text default 'Added credits')
returns public.wallets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.wallets;
begin
  if auth.uid() is null then
    raise exception 'top_up_wallet requires an authenticated caller' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'top-up must be greater than zero' using errcode = '22023';
  end if;

  update public.wallets w
     set balance_cents = w.balance_cents + p_amount
   where w.profile_id = auth.uid()
   returning * into v_wallet;

  if not found then
    raise exception 'wallet not found' using errcode = 'P0002';
  end if;

  insert into public.wallet_transactions (profile_id, kind, amount_cents, order_id, memo)
  values (auth.uid(), 'topup', p_amount, null, p_memo);

  return v_wallet;
end;
$$;

-- =============================================================================
-- 5. Order state transitions
-- =============================================================================

-- The only way an order's money/state columns move (they are revoked above).
-- The caller must be the buyer or the agent's owner.
create or replace function public.advance_order(
  p_order_id      uuid,
  p_status        text,
  p_progress      integer,
  p_output        jsonb default null,
  p_cost          jsonb default null,
  p_delivered_at  timestamptz default null,
  p_audit         jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'advance_order requires an authenticated caller' using errcode = '42501';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id is distinct from auth.uid() and not public.owns_agent(v_order.agent_id) then
    raise exception 'not a participant of this order' using errcode = '42501';
  end if;

  update public.orders o
     set status       = coalesce(p_status::public.order_status, o.status),
         progress     = coalesce(p_progress, o.progress),
         output       = coalesce(p_output, o.output),
         cost_breakdown = coalesce(p_cost, o.cost_breakdown),
         delivered_at = coalesce(p_delivered_at, o.delivered_at),
         audit_log    = case
           when p_audit is null then o.audit_log
           else o.audit_log || (
             select coalesce(array_agg(value), array[]::jsonb[])
             from jsonb_array_elements(p_audit) as value
           )
         end
   where o.id = p_order_id
   returning * into v_order;

  return v_order;
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================

revoke execute on function public.publish_event(text, text, uuid, text, text, text, text, text) from public;
revoke execute on function public.apply_review_rating(uuid, integer, uuid) from public;
revoke execute on function public.hold_funds(uuid, integer, text, boolean) from public;
revoke execute on function public.settle_hold(uuid, text, boolean) from public;
revoke execute on function public.top_up_wallet(integer, text) from public;
revoke execute on function public.advance_order(uuid, text, integer, jsonb, jsonb, timestamptz, jsonb) from public;

grant execute on function public.publish_event(text, text, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.apply_review_rating(uuid, integer, uuid) to authenticated;
grant execute on function public.hold_funds(uuid, integer, text, boolean) to authenticated;
grant execute on function public.settle_hold(uuid, text, boolean) to authenticated;
grant execute on function public.top_up_wallet(integer, text) to authenticated;
grant execute on function public.advance_order(uuid, text, integer, jsonb, jsonb, timestamptz, jsonb) to authenticated;
