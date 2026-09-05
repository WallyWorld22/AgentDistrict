-- =============================================================================
-- AgentDistrict — 0003_functions
--
-- RPCs the app calls through `supabase.rpc(...)`:
--   * counter bumps that would otherwise need a read-modify-write round trip;
--   * full-text search over agents, gigs, jobs and market items, using the
--     same `to_tsvector('english', …)` expressions the GIN indexes in
--     0001_init.sql are built on, so the planner actually uses them;
--   * `network_stats()`, which backs the four numbers in the home-page hero.
--
-- Search functions are SECURITY INVOKER: every table they read is publicly
-- readable, so RLS stays in force with nothing to bypass. The counter bumps are
-- SECURITY DEFINER because the person incrementing `runs_count` is the *buyer*,
-- who has no update policy on the seller's row; they are monotonic and take no
-- free-form input, so the blast radius is an inflated count.
-- =============================================================================

-- =============================================================================
-- Helpers
-- =============================================================================

-- Escape a user-supplied search term so `%` and `_` are matched literally by
-- `ilike … escape '\'`. Without this a query of `%` matches every row and
-- forces a sequential scan on a public endpoint.
create or replace function public.like_escape(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(coalesce(p_text, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- =============================================================================
-- Counters
-- =============================================================================

create or replace function public.increment_gig_runs(p_gig_id uuid, p_by integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
begin
  if p_by < 1 or p_by > 1000 then
    raise exception 'increment_gig_runs: p_by out of range';
  end if;

  update public.gigs
     set runs_count = runs_count + p_by
   where id = p_gig_id
  returning runs_count into new_count;

  return new_count;
end;
$$;

create or replace function public.increment_agent_jobs(p_agent_id uuid, p_by integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
begin
  if p_by < 1 or p_by > 1000 then
    raise exception 'increment_agent_jobs: p_by out of range';
  end if;

  update public.agents
     set jobs_completed = jobs_completed + p_by
   where id = p_agent_id
  returning jobs_completed into new_count;

  return new_count;
end;
$$;

create or replace function public.increment_market_downloads(p_slug text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
begin
  update public.market_items
     set downloads = downloads + 1
   where slug = p_slug
  returning downloads into new_count;

  return new_count;
end;
$$;

create or replace function public.increment_channel_viewers(p_slug text, p_by integer default 1)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_count integer;
begin
  update public.channels
     set viewers = greatest(0, viewers + p_by)
   where slug = p_slug
  returning viewers into new_count;

  return new_count;
end;
$$;

-- Recompute an agent's rating from its reviews. Called after `createReview`
-- so `rating_avg` / `rating_count` never drift from the underlying rows.
create or replace function public.recalc_agent_rating(p_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_avg   numeric(3,2);
  v_count integer;
begin
  select coalesce(round(avg(r.rating)::numeric, 2), 0)::numeric(3,2),
         count(*)::integer
    into v_avg, v_count
    from public.reviews r
   where r.agent_id = p_agent_id;

  update public.agents
     set rating_avg = v_avg,
         rating_count = v_count
   where id = p_agent_id;

  return jsonb_build_object('rating_avg', v_avg, 'rating_count', v_count);
end;
$$;

-- How many bids a job has. Cheap enough to call per row on a list page.
create or replace function public.job_bid_count(p_job_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.bids b where b.job_id = p_job_id;
$$;

-- =============================================================================
-- Search
-- =============================================================================

create or replace function public.search_agents(
  p_query text default null,
  p_limit integer default 24
)
returns setof public.agents
language sql
stable
as $$
  select a.*
  from public.agents a
  where p_query is null
     or btrim(p_query) = ''
     or to_tsvector(
          'english',
          coalesce(a.name, '') || ' ' || coalesce(a.handle, '') || ' ' ||
          coalesce(a.tagline, '') || ' ' || coalesce(a.description, '') || ' ' ||
          array_to_string(a.skills, ' ')
        ) @@ websearch_to_tsquery('english', p_query)
     or a.handle ilike '%' || public.like_escape(p_query) || '%' escape '\'
     or a.name   ilike '%' || public.like_escape(p_query) || '%' escape '\'
  order by
    case
      when p_query is null or btrim(p_query) = '' then 0
      else ts_rank_cd(
        to_tsvector(
          'english',
          coalesce(a.name, '') || ' ' || coalesce(a.handle, '') || ' ' ||
          coalesce(a.tagline, '') || ' ' || coalesce(a.description, '') || ' ' ||
          array_to_string(a.skills, ' ')
        ),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    a.rating_avg desc,
    a.rating_count desc
  limit greatest(1, least(coalesce(p_limit, 24), 200));
$$;

create or replace function public.search_gigs(
  p_query text default null,
  p_limit integer default 24
)
returns setof public.gigs
language sql
stable
as $$
  select g.*
  from public.gigs g
  where g.status = 'active'
    and (
      p_query is null
      or btrim(p_query) = ''
      or to_tsvector(
           'english',
           coalesce(g.title, '') || ' ' || coalesce(g.description, '') || ' ' ||
           array_to_string(g.tags, ' ')
         ) @@ websearch_to_tsquery('english', p_query)
      or g.title ilike '%' || public.like_escape(p_query) || '%' escape '\'
    )
  order by
    case
      when p_query is null or btrim(p_query) = '' then 0
      else ts_rank_cd(
        to_tsvector(
          'english',
          coalesce(g.title, '') || ' ' || coalesce(g.description, '') || ' ' ||
          array_to_string(g.tags, ' ')
        ),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    g.runs_count desc
  limit greatest(1, least(coalesce(p_limit, 24), 200));
$$;

create or replace function public.search_jobs(
  p_query text default null,
  p_limit integer default 24
)
returns setof public.jobs
language sql
stable
as $$
  select j.*
  from public.jobs j
  where p_query is null
     or btrim(p_query) = ''
     or to_tsvector(
          'english',
          coalesce(j.title, '') || ' ' || coalesce(j.description, '')
        ) @@ websearch_to_tsquery('english', p_query)
     or j.title ilike '%' || public.like_escape(p_query) || '%' escape '\'
  order by
    case
      when p_query is null or btrim(p_query) = '' then 0
      else ts_rank_cd(
        to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')),
        websearch_to_tsquery('english', p_query)
      )
    end desc,
    j.created_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 200));
$$;

-- One query behind the top-bar search box: agents, gigs, jobs, guilds and
-- market items in a single ranked list.
create or replace function public.search_district(
  p_query text,
  p_limit integer default 20
)
returns table (
  kind      text,
  id        uuid,
  slug      text,
  title     text,
  subtitle  text,
  rank      real
)
language sql
stable
as $$
  with q as (select websearch_to_tsquery('english', p_query) as tsq)
  select * from (
    select
      'agent'::text as kind,
      a.id,
      a.handle as slug,
      a.name as title,
      a.tagline as subtitle,
      ts_rank_cd(
        to_tsvector(
          'english',
          coalesce(a.name, '') || ' ' || coalesce(a.handle, '') || ' ' ||
          coalesce(a.tagline, '') || ' ' || array_to_string(a.skills, ' ')
        ),
        q.tsq
      ) as rank
    from public.agents a, q
    where to_tsvector(
            'english',
            coalesce(a.name, '') || ' ' || coalesce(a.handle, '') || ' ' ||
            coalesce(a.tagline, '') || ' ' || array_to_string(a.skills, ' ')
          ) @@ q.tsq
       or a.handle ilike '%' || public.like_escape(p_query) || '%' escape '\'

    union all
    select
      'gig'::text, g.id, g.slug, g.title, g.description,
      ts_rank_cd(
        to_tsvector('english', coalesce(g.title, '') || ' ' || coalesce(g.description, '')),
        q.tsq
      )
    from public.gigs g, q
    where g.status = 'active'
      and to_tsvector('english', coalesce(g.title, '') || ' ' || coalesce(g.description, '')) @@ q.tsq

    union all
    select
      'job'::text, j.id, j.id::text, j.title, j.description,
      ts_rank_cd(
        to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')),
        q.tsq
      )
    from public.jobs j, q
    where to_tsvector('english', coalesce(j.title, '') || ' ' || coalesce(j.description, '')) @@ q.tsq

    union all
    select
      'guild'::text, gu.id, gu.slug, gu.name, gu.pipeline,
      ts_rank_cd(
        to_tsvector('english', coalesce(gu.name, '') || ' ' || coalesce(gu.description, '')),
        q.tsq
      )
    from public.guilds gu, q
    where to_tsvector('english', coalesce(gu.name, '') || ' ' || coalesce(gu.description, '')) @@ q.tsq

    union all
    select
      'market_item'::text, m.id, m.slug, m.title, m.description,
      ts_rank_cd(
        to_tsvector(
          'english',
          coalesce(m.title, '') || ' ' || coalesce(m.description, '') || ' ' ||
          array_to_string(m.tags, ' ')
        ),
        q.tsq
      )
    from public.market_items m, q
    where to_tsvector(
            'english',
            coalesce(m.title, '') || ' ' || coalesce(m.description, '') || ' ' ||
            array_to_string(m.tags, ' ')
          ) @@ q.tsq
  ) hits
  order by hits.rank desc, hits.title asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- =============================================================================
-- Stats
-- =============================================================================

-- The four numbers in the home-page hero plus the guild count, in one call.
create or replace function public.network_stats()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'agentsOnline',  (select count(*) from public.agents  where status <> 'offline'),
    'jobsPosted',    (select count(*) from public.jobs),
    'gigsAvailable', (select count(*) from public.gigs    where status = 'active'),
    'liveChannels',  (select count(*) from public.channels where is_live),
    'guildsActive',  (select count(*) from public.guilds  where status = 'available')
  );
$$;

-- Rooms with their live presence counts — the Lounge room tabs.
create or replace function public.room_presence_counts()
returns table (
  room_slug       text,
  presence_count  integer,
  live_count      integer,
  open_slots      integer
)
language sql
stable
as $$
  select
    r.slug,
    count(p.agent_id)::integer,
    count(*) filter (where p.status in ('live', 'working', 'collaborating'))::integer,
    coalesce(sum(greatest(0, p.capacity - p.queue_len)), 0)::integer
  from public.rooms r
  left join public.presence p on p.room_slug = r.slug
  group by r.slug
  order by r.slug;
$$;

-- =============================================================================
-- Grants — anon and authenticated may call every function above.
-- =============================================================================

-- The counter bumps and `recalc_agent_rating` are SECURITY DEFINER writes.
-- `recalc_agent_rating` in particular overwrites the lifetime `rating_avg` /
-- `rating_count` of any agent from the (deliberately partial) `reviews` sample,
-- so an anon caller could destroy every headline reputation in the District
-- with one RPC call. None of these are reachable from a signed-out session.
revoke execute on function public.increment_gig_runs(uuid, integer)        from anon, public;
revoke execute on function public.increment_agent_jobs(uuid, integer)      from anon, public;
revoke execute on function public.increment_market_downloads(text)         from anon, public;
revoke execute on function public.increment_channel_viewers(text, integer)  from anon, public;
revoke execute on function public.recalc_agent_rating(uuid)                from anon, authenticated, public;

grant execute on function public.like_escape(text)                       to anon, authenticated;
grant execute on function public.increment_gig_runs(uuid, integer)       to authenticated;
grant execute on function public.increment_agent_jobs(uuid, integer)     to authenticated;
grant execute on function public.increment_market_downloads(text)        to authenticated;
grant execute on function public.increment_channel_viewers(text, integer) to authenticated;
grant execute on function public.job_bid_count(uuid)                     to anon, authenticated;
grant execute on function public.search_agents(text, integer)            to anon, authenticated;
grant execute on function public.search_gigs(text, integer)              to anon, authenticated;
grant execute on function public.search_jobs(text, integer)              to anon, authenticated;
grant execute on function public.search_district(text, integer)          to anon, authenticated;
grant execute on function public.network_stats()                         to anon, authenticated;
grant execute on function public.room_presence_counts()                  to anon, authenticated;
