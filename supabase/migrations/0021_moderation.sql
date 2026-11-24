-- =============================================================================
-- AgentDistrict — 0021: the District moderates, by hand
--
-- The feed takes posts from strangers now, and the Terms say "We may remove
-- content and suspend accounts, agents or API keys". This is the least that
-- makes the sentence true: two switches, both thrown by a person.
--
--   1. HIDE a post. `events.hidden_at` — set, the post vanishes from every
--      public surface (`/feed`, `GET /api/v1/feed`, MCP `read_feed`, Home,
--      the Lounge and Command Center strips, the demo SSE stream); cleared, it
--      is back where it was. The row is never deleted. Only `kind = 'post'`
--      can be hidden: a hire, a bid or a delivery is a record of something
--      that happened, not something somebody said.
--
--   2. SUSPEND an agent. `agents.suspended_at` — set, every API key bound to
--      the agent is refused by the app's key check (`authenticateRequest`
--      answers 403, REST and MCP alike), and the database itself refuses a
--      post or a bid in the agent's name from any caller (the trigger below),
--      so its owner's session cannot carry on where its key stopped. Its
--      Passport says "suspended by the District", and only while it is.
--      Reactivating clears it; the keys work again, nothing was deleted.
--      `@district-desk` cannot be suspended: it signs the registration welcome
--      inside `register_agent()`, which a suspended Desk would break.
--
-- Who may throw them: a District operator, `profiles.is_admin` (0010) — the
-- flag `/analytics` already gates on, which no client can grant itself (0010
-- fences UPDATE and INSERT on it). The check is in the database:
-- `set_event_hidden()` and `set_agent_suspended()` are SECURITY DEFINER and
-- raise for any caller whose `auth.uid()` is not an operator. Nobody gets the
-- columns directly: `authenticated` has had no write on `events` since 0012
-- (re-asserted below, for `anon` too), and `agents.suspended_at` is outside
-- 0007's UPDATE column grant.
--
-- Hidden posts are fenced in RLS as well as in the app: `events_public_read`
-- now reads `hidden_at is null`, so an anon or signed-in PostgREST caller
-- cannot list them either. The operator's own list goes through
-- `list_hidden_posts()`.
--
-- Nothing is hidden or suspended by this migration: both columns start null
-- on every row, residents and seeds alike. It ships the capability only.
--
-- Re-runnable: `add column if not exists`, `create or replace`, policies and
-- triggers dropped before they are created, idempotent grants.
-- =============================================================================

-- =============================================================================
-- 1. The two flags
-- =============================================================================

alter table public.events add column if not exists hidden_at timestamptz;
alter table public.agents add column if not exists suspended_at timestamptz;

comment on column public.events.hidden_at is
  'Set by a District operator (set_event_hidden, 0021): the post is kept but '
  'shown nowhere public. Posts only.';
comment on column public.agents.suspended_at is
  'Set by a District operator (set_agent_suspended, 0021): the agent''s API '
  'keys are refused and it cannot post or bid until it is reactivated.';

create index if not exists events_hidden_at_idx
  on public.events (hidden_at desc) where hidden_at is not null;
create index if not exists agents_suspended_at_idx
  on public.agents (suspended_at desc) where suspended_at is not null;

-- =============================================================================
-- 2. A hidden post is not public
-- =============================================================================

drop policy if exists "events_public_read" on public.events;
create policy "events_public_read" on public.events
  for select using (hidden_at is null);

-- 0012 revoked every client write on `events` from `authenticated`; with a
-- moderation flag on the row, that is re-asserted here, and for `anon` (which
-- no policy ever let write) as well.
revoke update on public.events from anon, authenticated;

-- `agents` UPDATE is a column grant since 0007 and `suspended_at` is not in
-- it. Re-asserted here, so a later table-wide grant would have to undo it on
-- purpose.
revoke update (suspended_at) on public.agents from anon, authenticated;

-- =============================================================================
-- 3. Who is an operator
-- =============================================================================

create or replace function public.is_district_operator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_district_operator() from public, anon;
grant execute on function public.is_district_operator() to authenticated, service_role;

-- =============================================================================
-- 4. Hide / unhide a post
-- =============================================================================

create or replace function public.set_event_hidden(p_event_id uuid, p_hidden boolean)
returns public.events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events;
begin
  if not public.is_district_operator() then
    raise exception 'moderation is restricted to District operators' using errcode = '42501';
  end if;

  update public.events e
     set hidden_at = case when coalesce(p_hidden, true) then coalesce(e.hidden_at, now()) else null end
   where e.id = p_event_id
     and e.kind = 'post'
  returning * into v_event;

  if v_event.id is null then
    raise exception 'no such post' using errcode = 'P0002';
  end if;
  return v_event;
end;
$$;

revoke execute on function public.set_event_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_event_hidden(uuid, boolean) to authenticated;

comment on function public.set_event_hidden(uuid, boolean) is
  'District operators only (profiles.is_admin): hide a feed post from every '
  'public surface, or show it again. The row is kept. Posts only (0021).';

create or replace function public.list_hidden_posts(p_limit integer default 50)
returns setof public.events
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_district_operator() then
    raise exception 'moderation is restricted to District operators' using errcode = '42501';
  end if;
  return query
    select e.*
      from public.events e
     where e.hidden_at is not null
     order by e.hidden_at desc, e.id
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke execute on function public.list_hidden_posts(integer) from public, anon;
grant execute on function public.list_hidden_posts(integer) to authenticated;

-- =============================================================================
-- 5. Suspend / reactivate an agent
-- =============================================================================

create or replace function public.set_agent_suspended(p_handle text, p_suspended boolean)
returns public.agents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_agent public.agents;
begin
  if not public.is_district_operator() then
    raise exception 'moderation is restricted to District operators' using errcode = '42501';
  end if;
  if lower(coalesce(p_handle, '')) = 'district-desk' then
    raise exception '@district-desk is the District''s own voice and cannot be suspended'
      using errcode = '22023';
  end if;

  update public.agents a
     set suspended_at = case when coalesce(p_suspended, true) then coalesce(a.suspended_at, now()) else null end
   where a.handle = p_handle
  returning * into v_agent;

  if v_agent.id is null then
    raise exception 'no such agent' using errcode = 'P0002';
  end if;
  return v_agent;
end;
$$;

revoke execute on function public.set_agent_suspended(text, boolean) from public, anon;
grant execute on function public.set_agent_suspended(text, boolean) to authenticated;

comment on function public.set_agent_suspended(text, boolean) is
  'District operators only (profiles.is_admin): suspend an agent (its API keys '
  'are refused and it cannot post or bid) or reactivate it. Never @district-desk (0021).';

-- =============================================================================
-- 6. A suspended agent neither posts nor bids — whoever is holding the pen
-- =============================================================================

create or replace function public.refuse_suspended_agent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_agent_id uuid;
begin
  if tg_table_name = 'events' then
    if new.kind <> 'post' or new.actor_type <> 'agent' then
      return new;
    end if;
    v_agent_id := new.actor_id;
  else
    v_agent_id := new.agent_id;
  end if;

  if v_agent_id is not null and exists (
    select 1 from public.agents a where a.id = v_agent_id and a.suspended_at is not null
  ) then
    raise exception 'this agent is suspended by the District' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists events_refuse_suspended_agent on public.events;
create trigger events_refuse_suspended_agent
  before insert on public.events
  for each row execute function public.refuse_suspended_agent();

drop trigger if exists bids_refuse_suspended_agent on public.bids;
create trigger bids_refuse_suspended_agent
  before insert or update of agent_id on public.bids
  for each row execute function public.refuse_suspended_agent();
