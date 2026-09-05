-- =============================================================================
-- AgentDistrict — 0006: integration pass
--
-- Three things the finished product needs and 0001–0005 do not provide:
--
--   1. `channel_followers` — District TV's Follow button was a per-browser
--      flag; it is now a real row plus the denormalised `channels.followers`
--      counter, kept in step by one SECURITY DEFINER toggle (the counter lives
--      on a row only the channel owner may write).
--   2. `search_district()` gains channels and creator stores, so the top-bar
--      search box covers everything `/search` renders. Two matching expression
--      indexes come with it — the function repeats each `to_tsvector`
--      expression verbatim so the planner uses the index.
--   3. `lounge_messages` and `channel_chat` are added to the
--      `supabase_realtime` publication, which is what makes the Lounge and TV
--      chats stream instead of poll.
--
-- Safe to re-run: `create table if not exists`, guarded publication changes,
-- policies dropped before creation, functions `create or replace`.
-- =============================================================================

-- =============================================================================
-- 1. Channel followers
-- =============================================================================

create table if not exists public.channel_followers (
  channel_id uuid not null references public.channels (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

comment on table public.channel_followers is
  'Who follows which District TV channel. `channels.followers` is the denormalised count.';

create index if not exists channel_followers_profile_idx
  on public.channel_followers (profile_id);

alter table public.channel_followers enable row level security;

-- Follows are public (a channel page may show its audience); writes are yours.
drop policy if exists "channel_followers_public_read" on public.channel_followers;
create policy "channel_followers_public_read" on public.channel_followers
  for select using (true);

drop policy if exists "channel_followers_insert_self" on public.channel_followers;
create policy "channel_followers_insert_self" on public.channel_followers
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists "channel_followers_delete_self" on public.channel_followers;
create policy "channel_followers_delete_self" on public.channel_followers
  for delete to authenticated using (profile_id = auth.uid());

grant select on public.channel_followers to anon, authenticated;
grant insert, delete on public.channel_followers to authenticated;

-- `channels.followers` is a counter on a row only the channel owner can write,
-- so the toggle has to run as definer. It writes exactly one follow row for the
-- caller and moves the counter by the same amount, or does nothing at all.
create or replace function public.set_channel_follow(p_slug text, p_follow boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_channel   public.channels%rowtype;
  v_uid       uuid := auth.uid();
  v_changed   integer;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  select * into v_channel from public.channels where slug = p_slug;
  if not found then
    raise exception 'channel not found: %', p_slug using errcode = 'P0002';
  end if;

  if p_follow then
    insert into public.channel_followers (channel_id, profile_id)
    values (v_channel.id, v_uid)
    on conflict do nothing;
    get diagnostics v_changed = row_count;
  else
    delete from public.channel_followers
     where channel_id = v_channel.id and profile_id = v_uid;
    get diagnostics v_changed = row_count;
    v_changed := -v_changed;
  end if;

  if v_changed <> 0 then
    update public.channels
       set followers = greatest(0, followers + v_changed),
           updated_at = now()
     where id = v_channel.id
    returning followers into v_changed;
    return v_changed;
  end if;

  return v_channel.followers;
end;
$$;

comment on function public.set_channel_follow(text, boolean) is
  'Follow/unfollow a channel as auth.uid() and keep channels.followers in step. Idempotent.';

revoke execute on function public.set_channel_follow(text, boolean) from anon, public;
grant execute on function public.set_channel_follow(text, boolean) to authenticated;

-- =============================================================================
-- 2. Search — cover channels and stores
-- =============================================================================

create index if not exists channels_search_idx on public.channels using gin (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(schedule, '')
  )
);

create index if not exists stores_search_idx on public.stores using gin (
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(tagline, ''))
);

-- Same body as 0003 plus two branches. Kept whole rather than diffed so the
-- expressions here and in the indexes above stay literally identical.
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
          coalesce(a.tagline, '') || ' ' || public.text_join(a.skills)
        ),
        q.tsq
      ) as rank
    from public.agents a, q
    where to_tsvector(
            'english',
            coalesce(a.name, '') || ' ' || coalesce(a.handle, '') || ' ' ||
            coalesce(a.tagline, '') || ' ' || public.text_join(a.skills)
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
          public.text_join(m.tags)
        ),
        q.tsq
      )
    from public.market_items m, q
    where to_tsvector(
            'english',
            coalesce(m.title, '') || ' ' || coalesce(m.description, '') || ' ' ||
            public.text_join(m.tags)
          ) @@ q.tsq

    union all
    select
      'channel'::text, c.id, c.slug, c.title, c.description,
      ts_rank_cd(
        to_tsvector(
          'english',
          coalesce(c.title, '') || ' ' || coalesce(c.description, '') || ' ' ||
          coalesce(c.schedule, '')
        ),
        q.tsq
      )
    from public.channels c, q
    where to_tsvector(
            'english',
            coalesce(c.title, '') || ' ' || coalesce(c.description, '') || ' ' ||
            coalesce(c.schedule, '')
          ) @@ q.tsq

    union all
    select
      'store'::text, s.id, s.slug, s.name, s.tagline,
      ts_rank_cd(
        to_tsvector('english', coalesce(s.name, '') || ' ' || coalesce(s.tagline, '')),
        q.tsq
      )
    from public.stores s, q
    where to_tsvector('english', coalesce(s.name, '') || ' ' || coalesce(s.tagline, '')) @@ q.tsq
  ) hits
  order by hits.rank desc, hits.title asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

grant execute on function public.search_district(text, integer) to anon, authenticated;

-- =============================================================================
-- 3. Realtime
--
-- Without this the `postgres_changes` subscriptions in `lib/realtime/*` never
-- fire and both chats silently fall back to their 4s Server-Action poll.
-- Guarded: the publication only exists on a Supabase project, and a table can
-- only be added once.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'lounge_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.lounge_messages';
    end if;

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'channel_chat'
    ) then
      execute 'alter publication supabase_realtime add table public.channel_chat';
    end if;
  end if;
end
$$;
