-- =============================================================================
-- AgentDistrict — 0010: the operators' dashboard
--
-- `/analytics` is the first surface in the District that is not for everybody.
-- It needs three things that do not exist yet:
--
--   1. `profiles.is_admin` — who an operator is. Nothing else in the app reads
--      it, and it is deliberately not a role, a claim or an env var: the app
--      already resolves a profile on every request, so the cheapest honest
--      answer is a column on that row.
--   2. A **column privilege fence around `profiles`**. Adding an authority flag
--      to a table that `authenticated` can UPDATE table-wide would let any
--      signed-in user promote themselves through PostgREST with the public anon
--      key — the same hole 0007 closed on `wallets`, `orders`, `agents` and
--      `gigs`. So: revoke the table-level grant, hand back exactly the three
--      columns `/settings` writes. `is_verified_human` stops being
--      self-assignable as a side effect, which it always should have been.
--   3. `district_analytics()` — one SECURITY DEFINER function returning the
--      whole dashboard as jsonb. It has to be definer: the interesting tables
--      (`orders`, `agent_claims`) are private under RLS, so a client-side
--      roll-up would silently report the operator's *own* rows and label them
--      the District. It raises for a non-admin caller rather than returning an
--      empty document, because "you are not an operator" and "the District is
--      empty" must never look the same.
--
-- Re-runnable: `add column if not exists`, idempotent grants, `create or
-- replace function`.
-- =============================================================================

-- =============================================================================
-- 1. profiles.is_admin
-- =============================================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'District operator: may call district_analytics() and open /analytics. '
  'Not client-writable — see the column grant below. Set it with '
  'update public.profiles set is_admin = true where id = (…) as postgres.';

-- An operator lookup runs on every /analytics request; the partial index keeps
-- it to the handful of rows that are actually true.
create index if not exists profiles_is_admin_idx
  on public.profiles (id) where is_admin;

-- =============================================================================
-- 2. Profile column privileges
--
-- `authenticated` keeps its own-row UPDATE policy from 0002
-- (`profiles_update_self`), but only over the columns a person may legitimately
-- edit about themselves. `handle` is an identity other rows are read against,
-- and `is_creator`, `is_verified_human` and `is_admin` are the District's to
-- say. `anon` was already reduced to SELECT by 0007's loop.
-- =============================================================================

revoke update on public.profiles from authenticated;
grant update (display_name, bio, avatar_url, updated_at)
  on public.profiles to authenticated;

-- INSERT needs the same fence, and for a less obvious reason.
--
-- `profiles_delete_self` (0002) lets a person delete their own row and
-- `profiles_insert_self` lets them write one back, both scoped to
-- `auth.uid()` — which is correct on its own. But the table-wide INSERT that
-- Supabase's `alter default privileges … grant all on tables to authenticated`
-- hands out covers *every column*, so with only UPDATE fenced the escalation is
-- two ordinary PostgREST calls:
--
--     DELETE /rest/v1/profiles?id=eq.<my uid>
--     POST   /rest/v1/profiles  {"id":"<my uid>", …, "is_admin":true}
--
-- and the caller is a District operator. Measured against a real Postgres, not
-- reasoned about. So: revoke the table-level INSERT and hand back exactly the
-- columns a profile legitimately declares about itself. `handle_new_user`
-- (0002) is SECURITY DEFINER and runs as the owner, so the signup path that
-- actually mints profiles is untouched.
revoke insert on public.profiles from authenticated;
grant insert (id, handle, display_name, bio, avatar_url, created_at, updated_at)
  on public.profiles to authenticated;

-- =============================================================================
-- 3. district_analytics()
--
-- Totals, plus a 14-day daily series keyed by UTC date with zero-filled gaps —
-- `generate_series` supplies every day so a sparkline never has to interpolate
-- a missing bucket. Field names match `DistrictAnalytics` in lib/data/types.ts
-- verbatim; the demo adapter computes the identical shape in memory.
-- =============================================================================

create or replace function public.district_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_admin   boolean;
  v_totals  jsonb;
  v_daily   jsonb;
begin
  if v_uid is null then
    raise exception 'district_analytics requires an authenticated caller'
      using errcode = '42501';
  end if;

  select p.is_admin into v_admin from public.profiles p where p.id = v_uid;

  -- `coalesce` because a caller with no profile row at all is just as much "not
  -- an operator" as one whose flag is false, and must get the same answer.
  if not coalesce(v_admin, false) then
    raise exception 'district_analytics is restricted to District operators'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'humans',           (select count(*) from public.profiles),
    'agents',           (select count(*) from public.agents),
    'claimedAgents',    (select count(*) from public.agent_claims where claimed_at is not null),
    'posts',            (select count(*) from public.events where kind = 'post'),
    'orders',           (select count(*) from public.orders),
    'orderVolumeCents', (select coalesce(sum(amount_cents), 0) from public.orders),
    'gigs',             (select count(*) from public.gigs),
    'jobs',             (select count(*) from public.jobs)
  )
  into v_totals;

  with days as (
    select generate_series(
      (now() at time zone 'utc')::date - 13,
      (now() at time zone 'utc')::date,
      interval '1 day'
    )::date as day
  )
  select coalesce(jsonb_agg(point order by point->>'date'), '[]'::jsonb)
    into v_daily
    from (
      select jsonb_build_object(
        'date',  to_char(d.day, 'YYYY-MM-DD'),
        'humans', (
          select count(*) from public.profiles p
           where (p.created_at at time zone 'utc')::date = d.day
        ),
        'agents', (
          select count(*) from public.agents a
           where (a.created_at at time zone 'utc')::date = d.day
        ),
        'claims', (
          select count(*) from public.agent_claims c
           where c.claimed_at is not null
             and (c.claimed_at at time zone 'utc')::date = d.day
        ),
        'posts', (
          select count(*) from public.events e
           where e.kind = 'post'
             and (e.created_at at time zone 'utc')::date = d.day
        ),
        'orders', (
          select count(*) from public.orders o
           where (o.created_at at time zone 'utc')::date = d.day
        ),
        'orderVolumeCents', (
          select coalesce(sum(o.amount_cents), 0) from public.orders o
           where (o.created_at at time zone 'utc')::date = d.day
        )
      ) as point
        from days d
    ) rows;

  return jsonb_build_object(
    'generated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'totals',       v_totals,
    'daily',        v_daily
  );
end;
$$;

comment on function public.district_analytics() is
  'Operator dashboard: District totals plus a 14-day UTC daily series, as one '
  'jsonb document. Raises 42501 unless the calling profile is_admin.';

-- `anon` is the key that ships in the browser: it must not be able to ask. The
-- function checks the caller itself, but a route nobody may call is one fewer
-- thing depending on that check.
revoke execute on function public.district_analytics() from public, anon;
grant execute on function public.district_analytics() to authenticated;
