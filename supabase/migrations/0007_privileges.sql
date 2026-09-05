-- =============================================================================
-- AgentDistrict — 0007: privileges, the order state machine, and the pause
--
-- 0005 tried to take money and reputation away from the browser with
-- column-level `revoke update (...)`. On a real project that is a **no-op**:
-- Postgres cannot subtract a column privilege from a table-wide grant, and
-- Supabase's `alter default privileges … grant all on tables to anon,
-- authenticated` hands out exactly such a grant on every new table. So any
-- signed-in user could still rewrite their own wallet balance, their orders'
-- money/state columns and their agents' reputation straight through PostgREST
-- with the public anon key.
--
-- This migration:
--
--   1. revokes the **table-level** privilege first and grants back only the
--      columns an owner may legitimately edit, and reduces `anon` to SELECT;
--   2. adds `wallets.autonomous_paused` — the Command Center kill switch as
--      server state rather than a per-browser cookie, enforced inside the same
--      transaction that places a hold;
--   3. rewrites `hold_funds` (zero-cost packages are free, not an error; a zero
--      limit means "no unattended spend", not "no ceiling");
--   4. gives `settle_hold` a state machine so a hold can be settled exactly
--      once, from a settleable status, with the direction derived from that
--      status rather than trusted from the caller;
--   5. constrains `advance_order` to legal transitions;
--   6. stops `publish_event` letting a caller author District-wide copy or an
--      off-site link;
--   7. makes the order price server-checked and reviews honest (approved runs
--      only, never your own agent).
--
-- Re-runnable: grants are idempotent, functions are `create or replace`,
-- policies are dropped first, and the column add is `if not exists`.
-- =============================================================================

-- =============================================================================
-- 1. Table privileges
-- =============================================================================

-- `anon` is the key that ships in the browser and in every machine-surface
-- request. It reads the marketplace; it writes nothing. RLS was the only thing
-- standing between it and INSERT/UPDATE/DELETE on every table.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from anon', r.tablename);
    execute format('grant select on public.%I to anon', r.tablename);
  end loop;
end
$$;

-- Money. `authenticated` may edit its own spend policy and nothing else; every
-- balance change goes through `hold_funds` / `settle_hold` / `top_up_wallet`.
revoke update on public.wallets from authenticated;
grant update (
  approval_threshold_cents,
  autonomous_spend_limit_cents,
  autonomous_paused,
  updated_at
) on public.wallets to authenticated;

-- Orders. State, progress, output and money move through `advance_order()`.
-- The brief is the one field a participant may still rewrite directly.
revoke update on public.orders from authenticated;
grant update (brief, updated_at) on public.orders to authenticated;

-- Agents. Reputation (`rating_avg`, `rating_count`, `jobs_completed`,
-- `reliability`, `dispute_rate`, `repeat_hire_rate`, `avg_latency_sec`),
-- `verified`, `handle` and `owner_id` are never client-writable.
revoke update on public.agents from authenticated;
grant update (
  name, tagline, description, avatar_emoji, avatar_gradient, category,
  skills, regions, status, room_slug, pricing_model, starting_price_cents,
  endpoints, mcp_tools, is_free, store_id, updated_at
) on public.agents to authenticated;

-- Gigs. Same shape: the listing is the creator's, the counters are the
-- District's (`increment_gig_runs`, `apply_review_rating`).
revoke update on public.gigs from authenticated;
grant update (
  title, description, category, tags, input_contract, output_contract,
  packages, starting_price_cents, delivery_seconds, status, updated_at
) on public.gigs to authenticated;

-- Reviews are written once and never edited: the rating has already been folded
-- into the agent's lifetime average by then.
revoke update on public.reviews from authenticated;

-- =============================================================================
-- 2. The spend pause, as server state
-- =============================================================================

alter table public.wallets
  add column if not exists autonomous_paused boolean not null default false;

comment on column public.wallets.autonomous_paused is
  'Command Center kill switch: refuse every unattended hold on this wallet.';

-- =============================================================================
-- 3. Who is calling
--
-- A machine caller (API key, MCP client) authenticates in the app and reaches
-- Postgres through the **service role**, so `auth.uid()` is null and every
-- money/event/reputation RPC refused it — the "agents can use the District
-- programmatically" story only worked in demo mode. These two helpers let such
-- a caller name the profile it is acting for, and only the service role may.
-- =============================================================================

create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

-- "Does this profile own that agent?" — the explicit-subject form of
-- `owns_agent()`, which reads `auth.uid()` and is therefore blind to a
-- service-role caller acting for someone.
create or replace function public.owns_agent_as(p_agent_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.agents a
    where a.id = p_agent_id and a.owner_id = p_profile_id
  );
$$;

create or replace function public.acting_uid(p_actor uuid default null)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is not null then auth.uid()
    when p_actor is not null and public.is_service_role() then p_actor
    else null
  end;
$$;

grant execute on function public.is_service_role() to anon, authenticated, service_role;
grant execute on function public.acting_uid(uuid) to anon, authenticated, service_role;
grant execute on function public.owns_agent_as(uuid, uuid) to anon, authenticated, service_role;

-- The signatures below all gain a trailing `p_actor`, so the four-argument
-- originals from 0005 are dropped first (two overloads would be ambiguous).
drop function if exists public.hold_funds(uuid, integer, text, boolean);
drop function if exists public.settle_hold(uuid, text, boolean);
drop function if exists public.advance_order(uuid, text, integer, jsonb, jsonb, timestamptz, jsonb);
drop function if exists public.publish_event(text, text, uuid, text, text, text, text, text);
drop function if exists public.apply_review_rating(uuid, integer, uuid);
drop function if exists public.top_up_wallet(integer, text);

-- =============================================================================
-- 4. hold_funds — free packages, the pause, and honest limits
-- =============================================================================

create or replace function public.hold_funds(
  p_order_id uuid,
  p_amount   integer,
  p_memo     text,
  p_approved boolean default false,
  p_actor    uuid default null
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
  v_uid       uuid := public.acting_uid(p_actor);
begin
  if v_uid is null then
    raise exception 'hold_funds requires an authenticated caller' using errcode = '42501';
  end if;
  if p_amount < 0 then
    raise exception 'hold amount cannot be negative' using errcode = '22023';
  end if;

  select * into v_wallet from public.wallets w
   where w.profile_id = v_uid for update;
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

  -- Unattended spend (an API key, an MCP client, @World) is what the Workplace
  -- Gateway governs. A human who clicked "Continue ($x)" has already approved
  -- the price, which is what the threshold exists to ask for.
  if not p_approved then
    if v_wallet.autonomous_paused then
      raise exception 'spend limit: external agent spending is paused' using errcode = '22023';
    end if;
    -- A ceiling of zero means "no unattended spend at all". It never means
    -- "no ceiling" — that reading turned a locked-down wallet wide open.
    if p_amount > v_wallet.approval_threshold_cents then
      raise exception 'approval required: % exceeds the % approval threshold',
        p_amount, v_wallet.approval_threshold_cents using errcode = '22023';
    end if;
    if v_spent + p_amount > v_wallet.autonomous_spend_limit_cents then
      raise exception 'spend limit: daily autonomous ceiling reached' using errcode = '22023';
    end if;
  end if;

  update public.wallets w
     set held_cents = w.held_cents + p_amount,
         spend_today_cents = v_spent + p_amount,
         updated_at = now()
   where w.profile_id = v_uid
   returning * into v_wallet;

  -- A free package still writes its (zero) hold row, so `settle_hold` finds
  -- something to rewrite and the run shows up in the ledger like any other.
  insert into public.wallet_transactions (profile_id, kind, amount_cents, order_id, memo)
  values (v_uid, 'hold', -p_amount, p_order_id, p_memo);

  return v_wallet;
end;
$$;

-- =============================================================================
-- 5. settle_hold — settle once, from a settleable status
-- =============================================================================

-- `p_refund` is accepted for call-site compatibility but no longer trusted: the
-- direction comes from the order's own status. A delivered run pays out (and
-- becomes `approved` in the same transaction); a failed or disputed one is
-- refunded. Anything else is refused, and an order whose hold row has already
-- been rewritten is a no-op rather than a second settlement.
create or replace function public.settle_hold(
  p_order_id uuid,
  p_memo     text,
  p_refund   boolean default false,
  p_actor    uuid default null
)
returns public.wallets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   public.orders;
  v_wallet  public.wallets;
  v_amount  integer;
  v_refund  boolean;
  v_held    integer;
  v_uid     uuid := public.acting_uid(p_actor);
begin
  if v_uid is null then
    raise exception 'settle_hold requires an authenticated caller' using errcode = '42501';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id is distinct from v_uid then
    raise exception 'only the buyer can settle this hold' using errcode = '42501';
  end if;
  if v_order.status not in ('delivered', 'failed', 'disputed') then
    raise exception 'this run cannot be settled from status %', v_order.status
      using errcode = '22023';
  end if;

  select count(*) into v_held
    from public.wallet_transactions t
   where t.order_id = p_order_id
     and t.profile_id = v_order.buyer_id
     and t.kind = 'hold';

  -- Already settled (or never held): idempotent, and above all it must not
  -- release another order's held credits a second time.
  if v_held = 0 then
    select * into v_wallet from public.wallets w where w.profile_id = v_order.buyer_id;
    return v_wallet;
  end if;

  v_amount := v_order.amount_cents;
  v_refund := v_order.status <> 'delivered';

  update public.wallets w
     set held_cents    = greatest(0, w.held_cents - v_amount),
         balance_cents = case
           when v_refund then w.balance_cents
           else greatest(0, w.balance_cents - v_amount)
         end,
         spend_today_cents = case
           when v_refund then greatest(0, w.spend_today_cents - v_amount)
           else w.spend_today_cents
         end,
         updated_at = now()
   where w.profile_id = v_order.buyer_id
   returning * into v_wallet;

  update public.wallet_transactions t
     set kind = (case when v_refund then 'refund' else 'release' end)::public.transaction_kind,
         amount_cents = case when v_refund then v_amount else -v_amount end,
         memo = p_memo
   where t.order_id = p_order_id
     and t.profile_id = v_order.buyer_id
     and t.kind = 'hold';

  -- Paying out is what "approved" means, so the status moves here rather than
  -- in a separate call a client could skip.
  if not v_refund then
    update public.orders o
       set status = 'approved', progress = 100
     where o.id = p_order_id;
  end if;

  return v_wallet;
end;
$$;

-- =============================================================================
-- 6. advance_order — legal transitions only
-- =============================================================================

create or replace function public.advance_order(
  p_order_id      uuid,
  p_status        text,
  p_progress      integer,
  p_output        jsonb default null,
  p_cost          jsonb default null,
  p_delivered_at  timestamptz default null,
  p_audit         jsonb default null,
  p_actor         uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order  public.orders;
  v_next   public.order_status;
  v_buyer  boolean;
  v_uid    uuid := public.acting_uid(p_actor);
begin
  if v_uid is null then
    raise exception 'advance_order requires an authenticated caller' using errcode = '42501';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  v_buyer := v_order.buyer_id is not distinct from v_uid;
  if not v_buyer and not public.owns_agent_as(v_order.agent_id, v_uid) then
    raise exception 'not a participant of this order' using errcode = '42501';
  end if;

  v_next := coalesce(p_status::public.order_status, v_order.status);

  -- The run's own clock moves it forward; a settlement moves it to `approved`
  -- (inside `settle_hold`, where the money moves too); only the buyer may
  -- dispute. Nothing walks a terminal state back.
  if v_next <> v_order.status then
    if v_next = 'disputed' then
      if not v_buyer or v_order.status not in ('queued', 'running', 'delivered') then
        raise exception 'this run cannot be disputed from status %', v_order.status
          using errcode = '22023';
      end if;
    elsif v_order.status = 'queued' and v_next in ('running', 'delivered', 'failed', 'cancelled') then
      null;
    elsif v_order.status = 'running' and v_next in ('delivered', 'failed', 'cancelled') then
      null;
    else
      raise exception 'illegal order transition % -> %', v_order.status, v_next
        using errcode = '22023';
    end if;
  end if;

  update public.orders o
     set status       = v_next,
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
-- 7. publish_event — the District writes the copy, not the caller
-- =============================================================================

-- `events` is rendered as headline + body + link on the home page and in the
-- Lounge feed, so a caller-authored `system` event under a District byline is
-- stored content injection. System events are service-role only, agent events
-- must name an agent the caller actually deals with, and a CTA can only ever be
-- a path on this site.
create or replace function public.publish_event(
  p_kind        text,
  p_actor_type  text,
  p_actor_id    uuid,
  p_actor_name  text,
  p_headline    text,
  p_body        text,
  p_cta_label   text default null,
  p_cta_href    text default null,
  p_actor       uuid default null
)
returns public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
  v_uid   uuid := public.acting_uid(p_actor);
begin
  if v_uid is null then
    raise exception 'publish_event requires an authenticated caller' using errcode = '42501';
  end if;

  if p_actor_type = 'human' and p_actor_id is distinct from v_uid then
    raise exception 'cannot publish a human event for another profile'
      using errcode = '42501';
  end if;

  if p_actor_type = 'system' then
    raise exception 'system events are written by the District, not by a client'
      using errcode = '42501';
  end if;

  -- An agent event has to name an agent the caller owns or is doing business
  -- with (an order or an accepted bid), which is every case the app produces.
  if p_actor_type = 'agent' then
    if p_actor_id is null then
      raise exception 'an agent event must name an agent' using errcode = '22023';
    end if;
    if not public.owns_agent_as(p_actor_id, v_uid)
       and not exists (
         select 1 from public.orders o
          where o.agent_id = p_actor_id and o.buyer_id = v_uid
       )
       and not exists (
         select 1 from public.bids b
           join public.jobs j on j.id = b.job_id
          where b.agent_id = p_actor_id and j.poster_id = v_uid
       ) then
      raise exception 'not a counterparty of that agent' using errcode = '42501';
    end if;
  end if;

  if p_cta_href is not null
     and (p_cta_href !~ '^/[A-Za-z0-9/_.?=&%#-]*$' or p_cta_href like '//%') then
    raise exception 'cta_href must be a path on this site' using errcode = '22023';
  end if;

  insert into public.events (
    kind, actor_type, actor_id, actor_name, headline, body, cta_label, cta_href
  )
  values (
    p_kind::public.event_kind,
    p_actor_type::public.author_type,
    p_actor_id,
    left(coalesce(p_actor_name, ''), 80),
    left(coalesce(p_headline, ''), 160),
    left(coalesce(p_body, ''), 400),
    left(p_cta_label, 40),
    p_cta_href
  )
  returning * into v_event;

  return v_event;
end;
$$;

-- =============================================================================
-- 8. apply_review_rating / top_up_wallet — same acting-identity treatment
-- =============================================================================

create or replace function public.apply_review_rating(
  p_agent_id uuid,
  p_rating   integer,
  p_gig_id   uuid default null,
  p_actor    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_avg   numeric(3,2);
  v_count integer;
  v_uid   uuid := public.acting_uid(p_actor);
begin
  if v_uid is null then
    raise exception 'apply_review_rating requires an authenticated caller'
      using errcode = '42501';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;
  -- Only a reviewer who actually wrote a review for this agent may move it,
  -- and never for an agent they own.
  if public.owns_agent_as(p_agent_id, v_uid) then
    raise exception 'cannot rate your own agent' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.reviews r
    where r.agent_id = p_agent_id and r.reviewer_id = v_uid
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
  v_wallet public.wallets;
  v_uid    uuid := public.acting_uid(p_actor);
begin
  if v_uid is null then
    raise exception 'top_up_wallet requires an authenticated caller' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'top-up must be greater than zero' using errcode = '22023';
  end if;

  update public.wallets w
     set balance_cents = w.balance_cents + p_amount,
         updated_at = now()
   where w.profile_id = v_uid
   returning * into v_wallet;

  if not found then
    raise exception 'wallet not found' using errcode = 'P0002';
  end if;

  insert into public.wallet_transactions (profile_id, kind, amount_cents, order_id, memo)
  values (v_uid, 'topup', p_amount, null, p_memo);

  return v_wallet;
end;
$$;

-- =============================================================================
-- 9. Grants for the new signatures
-- =============================================================================

revoke execute on function public.hold_funds(uuid, integer, text, boolean, uuid) from public, anon;
revoke execute on function public.settle_hold(uuid, text, boolean, uuid) from public, anon;
revoke execute on function public.advance_order(uuid, text, integer, jsonb, jsonb, timestamptz, jsonb, uuid) from public, anon;
revoke execute on function public.publish_event(text, text, uuid, text, text, text, text, text, uuid) from public, anon;
revoke execute on function public.apply_review_rating(uuid, integer, uuid, uuid) from public, anon;
revoke execute on function public.top_up_wallet(integer, text, uuid) from public, anon;

grant execute on function public.hold_funds(uuid, integer, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.settle_hold(uuid, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.advance_order(uuid, text, integer, jsonb, jsonb, timestamptz, jsonb, uuid) to authenticated, service_role;
grant execute on function public.publish_event(text, text, uuid, text, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.apply_review_rating(uuid, integer, uuid, uuid) to authenticated, service_role;
grant execute on function public.top_up_wallet(integer, text, uuid) to authenticated, service_role;

-- =============================================================================
-- 10. Order price and review honesty, enforced by RLS
-- =============================================================================

-- The adapter reads the price from the package, but in supabase mode the
-- adapter is not the trust boundary — PostgREST is, and the anon key plus the
-- user's JWT are both in the browser. Without this a signed-in user could buy
-- an $18.00 gig for one cent.
drop policy if exists "orders_insert_buyer" on public.orders;
create policy "orders_insert_buyer" on public.orders
  for insert to authenticated with check (
    buyer_id = auth.uid()
    and (
      -- a gig order pays that gig's package price…
      (
        gig_id is not null
        and exists (
          select 1
            from public.gigs g,
                 lateral jsonb_array_elements(g.packages) pkg
           where g.id = orders.gig_id
             and g.status = 'active'
             and pkg->>'tier' = orders.package_tier::text
             and (pkg->>'price_cents')::integer = orders.amount_cents
        )
      )
      -- …and a job order pays the bid it awarded.
      or (
        bid_id is not null
        and exists (
          select 1
            from public.bids b
            join public.jobs j on j.id = b.job_id
           where b.id = orders.bid_id
             and b.agent_id = orders.agent_id
             and b.amount_cents = orders.amount_cents
             and j.id = orders.job_id
             and j.poster_id = auth.uid()
        )
      )
    )
  );

-- Reputation is earned from someone else's money: an approved run only, and
-- never an agent the reviewer owns.
drop policy if exists "reviews_insert_reviewer" on public.reviews;
create policy "reviews_insert_reviewer" on public.reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and order_id is not null
    and not public.owns_agent(reviews.agent_id)
    and exists (
      select 1 from public.orders o
      where o.id = reviews.order_id
        and o.buyer_id = auth.uid()
        and o.agent_id = reviews.agent_id
        and o.status = 'approved'
    )
  );
