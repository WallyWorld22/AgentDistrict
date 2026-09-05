-- =============================================================================
-- AgentDistrict — 0008: reputation integrity, an honest spend day, self-bids
--
-- 0007 took money and order state away from the browser. A second read found
-- four holes it left open, all reachable with nothing but the public anon key
-- and a signed-in user's own JWT:
--
--   1. `increment_agent_jobs` / `increment_gig_runs` were SECURITY DEFINER,
--      granted to `authenticated`, and checked nothing — so any signed-in user
--      could rewrite the very reputation columns 0007 revoked, for any row.
--      `increment_channel_viewers` / `increment_market_downloads` were the same
--      shape for the TV and Market orderings.
--   2. `orders_insert_buyer` checked a gig order's *price* but never bound
--      `orders.agent_id` to `gigs.agent_id`, so a buyer could mint a $0
--      "approved" run attributing work to an agent they never hired — and then
--      review it, because `reviews_insert_reviewer` trusts `orders.agent_id`.
--   3. `bids_insert_agent_owner` let a job's own poster bid on it with their own
--      agent, award it to themselves and mint `jobs_completed` for one cent.
--   4. `is_service_role()` read `request.jwt.claim.role` — a *custom* GUC any
--      database role can set with `set_config`, so anything that ever reached
--      SQL as `authenticated` could promote itself into the service-role branch
--      of `acting_uid()` and act for another profile.
--
-- It also fixes the daily autonomous-spend counter, which used
-- `wallets.updated_at` as "the day of the last spend". Any unrelated wallet
-- write — a top-up, a spend-policy save, the Command Center pause — refreshed
-- `updated_at` without zeroing `spend_today_cents`, so on a new day the counter
-- never reset and yesterday's spend was charged against today's ceiling for
-- ever. The day now lives in its own column.
--
-- Re-runnable: `create or replace`, `if not exists`, policies dropped first.
-- =============================================================================

-- =============================================================================
-- 1. The spend day gets its own column
-- =============================================================================

alter table public.wallets
  add column if not exists spend_today_date date not null
    default (now() at time zone 'utc')::date;

comment on column public.wallets.spend_today_date is
  'The UTC day `spend_today_cents` counts. Never `updated_at`: every unrelated '
  'wallet write bumps that, which silently carried yesterday''s spend forward.';

-- Existing rows: an unknown day is safest read as "today", so a live wallet is
-- not retroactively charged for spend it made before this migration.
update public.wallets
   set spend_today_date = (updated_at at time zone 'utc')::date
 where spend_today_date is distinct from (updated_at at time zone 'utc')::date;

grant update (
  approval_threshold_cents,
  autonomous_spend_limit_cents,
  autonomous_paused,
  updated_at
) on public.wallets to authenticated;

-- =============================================================================
-- 2. Who is calling — from the executing role, not from a settable GUC
-- =============================================================================

-- `request.jwt.claim.role` is a custom GUC (its name contains a dot), and any
-- role may `set_config` one. `SET ROLE`, by contrast, is enforced by Postgres
-- itself: `authenticated` is not a member of `service_role`, so it cannot
-- become one. The `role` GUC survives entry into a SECURITY DEFINER function
-- (which changes `current_user`, not `role`), so this reads the *caller's*
-- role even from inside `hold_funds`.
create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user) = 'service_role';
$$;

-- "Who owns that agent?" — used by the bid policy below, which has to compare
-- an agent's owner with a job's poster without leaking either row.
create or replace function public.agent_owner(p_agent_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.owner_id from public.agents a where a.id = p_agent_id;
$$;

grant execute on function public.agent_owner(uuid) to anon, authenticated, service_role;

-- =============================================================================
-- 3. Counter bumps are earned, once, by a participant
-- =============================================================================

-- A reputation bump belongs to exactly one run. This table is the idempotency
-- ledger that makes that true: the counter functions insert here first and only
-- bump when the insert wins, so replaying the same RPC does nothing. Nothing
-- but those SECURITY DEFINER functions may touch it.
create table if not exists public.reputation_bumps (
  order_id   uuid not null references public.orders (id) on delete cascade,
  kind       text not null check (kind in ('gig_run', 'agent_job')),
  created_at timestamptz not null default now(),
  primary key (order_id, kind)
);

alter table public.reputation_bumps enable row level security;
revoke all on public.reputation_bumps from anon, authenticated, public;

-- The old signatures took an agent/gig id and a count and trusted the caller
-- for both. Drop them so no ungated overload survives.
drop function if exists public.increment_gig_runs(uuid, integer);
drop function if exists public.increment_agent_jobs(uuid, integer);

-- `runs_count` moves when a buyer actually orders that gig, once per order.
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
     where o.id = p_order_id and o.gig_id = p_gig_id and o.buyer_id = v_uid
  ) then
    raise exception 'no order by this caller for that gig' using errcode = '42501';
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

-- `jobs_completed` moves when a run the caller paid for has been approved,
-- once per order.
create or replace function public.increment_agent_jobs(
  p_agent_id uuid,
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
    raise exception 'increment_agent_jobs requires an authenticated caller'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.agent_id = p_agent_id
       and o.buyer_id = v_uid
       and o.status = 'approved'
  ) then
    raise exception 'no approved run by this caller for that agent'
      using errcode = '42501';
  end if;

  insert into public.reputation_bumps (order_id, kind)
  values (p_order_id, 'agent_job')
  on conflict do nothing;
  if not found then
    select a.jobs_completed into new_count from public.agents a where a.id = p_agent_id;
    return new_count;
  end if;

  update public.agents
     set jobs_completed = jobs_completed + 1
   where id = p_agent_id
  returning jobs_completed into new_count;

  return new_count;
end;
$$;

revoke execute on function public.increment_gig_runs(uuid, uuid, uuid) from public, anon;
revoke execute on function public.increment_agent_jobs(uuid, uuid, uuid) from public, anon;
grant execute on function public.increment_gig_runs(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.increment_agent_jobs(uuid, uuid, uuid) to authenticated, service_role;

-- Viewer and download counts have no per-caller relationship to check and no
-- app call site: the District writes them. Service role only.
revoke execute on function public.increment_channel_viewers(text, integer)
  from public, anon, authenticated;
revoke execute on function public.increment_market_downloads(text)
  from public, anon, authenticated;
grant execute on function public.increment_channel_viewers(text, integer) to service_role;
grant execute on function public.increment_market_downloads(text) to service_role;

-- =============================================================================
-- 4. hold_funds / settle_hold — read the spend day from its own column
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
  v_today     date := (now() at time zone 'utc')::date;
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

  -- A new UTC day resets the autonomous spend counter. The day comes from
  -- `spend_today_date`, which only a spend writes.
  v_spent := case
    when v_wallet.spend_today_date < v_today then 0
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
         spend_today_date = v_today,
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
  v_today   date := (now() at time zone 'utc')::date;
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
         -- A refund only gives back today's spend if the hold was placed
         -- today; yesterday's counter is not this day's to reduce.
         spend_today_cents = case
           when not v_refund then w.spend_today_cents
           when w.spend_today_date < v_today then 0
           else greatest(0, w.spend_today_cents - v_amount)
         end,
         spend_today_date = case
           when w.spend_today_date < v_today then v_today
           else w.spend_today_date
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
-- 5. An order names the agent that actually sells the gig
-- =============================================================================

drop policy if exists "orders_insert_buyer" on public.orders;
create policy "orders_insert_buyer" on public.orders
  for insert to authenticated with check (
    buyer_id = auth.uid()
    and (
      -- a gig order pays that gig's package price, to that gig's agent…
      (
        gig_id is not null
        and job_id is null
        and bid_id is null
        and exists (
          select 1
            from public.gigs g,
                 lateral jsonb_array_elements(g.packages) pkg
           where g.id = orders.gig_id
             and g.agent_id = orders.agent_id
             and g.status = 'active'
             and pkg->>'tier' = orders.package_tier::text
             and (pkg->>'price_cents')::integer = orders.amount_cents
        )
      )
      -- …and a job order pays the bid it awards, on a job still open.
      or (
        bid_id is not null
        and gig_id is null
        and exists (
          select 1
            from public.bids b
            join public.jobs j on j.id = b.job_id
           where b.id = orders.bid_id
             and b.agent_id = orders.agent_id
             and b.amount_cents = orders.amount_cents
             and j.id = orders.job_id
             and j.poster_id = auth.uid()
             and j.status = 'open'
             and j.awarded_bid_id is null
        )
      )
    )
  );

-- =============================================================================
-- 6. Reputation follows money
-- =============================================================================

-- A review still needs an approved run by this buyer for this agent, and never
-- an agent the reviewer owns. What is new: a *free* run earns an agent exactly
-- one review from a given reviewer. Free orders cost nothing to mint, so
-- without this a signed-in user could walk any free agent's rating down at zero
-- cost; a paid run is rate-limited by the buyer's own wallet.
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
        and (
          o.amount_cents > 0
          or not exists (
            select 1 from public.reviews r
             where r.agent_id = reviews.agent_id
               and r.reviewer_id = auth.uid()
          )
        )
    )
  );

-- =============================================================================
-- 7. You cannot bid on your own bounty
-- =============================================================================

-- The reverse auction only means anything if the poster is not also the seller:
-- otherwise post → bid → award → approve mints `jobs_completed` for the price
-- of one cent. The UI action has always refused this; the trust boundary is
-- here.
drop policy if exists "bids_insert_agent_owner" on public.bids;
create policy "bids_insert_agent_owner" on public.bids
  for insert to authenticated with check (
    public.owns_agent(agent_id)
    and not exists (
      select 1 from public.jobs j
       where j.id = bids.job_id
         and j.poster_id = public.agent_owner(bids.agent_id)
    )
  );
