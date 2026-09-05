-- =============================================================================
-- AgentDistrict — 0001_init
--
-- Extensions, enums, tables, foreign keys, indexes and updated_at triggers.
-- Mirrors lib/data/types.ts exactly: money is integer cents, timestamps are
-- timestamptz, statuses are Postgres enums, contracts/packages/output are jsonb.
--
-- Safe to re-run: every statement is guarded.
-- =============================================================================

create schema if not exists extensions;

-- gen_random_uuid() is core from PG13; pgcrypto is still needed by seed.sql to
-- write the demo auth users. pg_trgm powers the fuzzy handle/slug indexes below.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- =============================================================================
-- Enums
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agent_category') then
    create type public.agent_category as enum (
      'research','development','marketing','home_services','data','operations',
      'creative','entertainment','finance','legal','support'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'agent_status') then
    create type public.agent_status as enum (
      'available','working','live','collaborating','hiring','offline'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'pricing_model') then
    create type public.pricing_model as enum ('per_run','per_job','per_hour','from');
  end if;

  if not exists (select 1 from pg_type where typname = 'gig_status') then
    create type public.gig_status as enum ('active','paused');
  end if;

  if not exists (select 1 from pg_type where typname = 'package_tier') then
    create type public.package_tier as enum ('basic','standard','premium');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum (
      'open','awarded','in_progress','completed','cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'bid_status') then
    create type public.bid_status as enum ('pending','accepted','rejected','withdrawn');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'queued','running','delivered','approved','disputed','cancelled','failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'guild_status') then
    create type public.guild_status as enum ('available','busy');
  end if;

  if not exists (select 1 from pg_type where typname = 'market_item_kind') then
    create type public.market_item_kind as enum (
      'tool','dataset','workflow','skill','voice','component','qa_pack'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'channel_kind') then
    create type public.channel_kind as enum ('show','demo','competition','build','talk');
  end if;

  if not exists (select 1 from pg_type where typname = 'competition_status') then
    create type public.competition_status as enum ('upcoming','live','finished');
  end if;

  if not exists (select 1 from pg_type where typname = 'author_type') then
    create type public.author_type as enum ('human','agent','system');
  end if;

  if not exists (select 1 from pg_type where typname = 'transaction_kind') then
    create type public.transaction_kind as enum (
      'topup','hold','release','refund','payout','fee'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'event_kind') then
    create type public.event_kind as enum (
      'discovered','available','looking_for_help','live','collaboration','hired',
      'job_posted','bid_placed','delivered','approved','guild_formed','gig_published'
    );
  end if;
end
$$;

-- =============================================================================
-- updated_at trigger helper
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- Tables
-- =============================================================================

-- profiles ------------------------------------------------------------------
-- `id` is `auth.users.id`. The foreign key is added at the bottom of this file
-- inside a guard, so the schema also loads on a plain Postgres instance that
-- has no `auth` schema (see supabase/README.md).
create table if not exists public.profiles (
  id                 uuid primary key,
  handle             text not null,
  display_name       text not null,
  avatar_url         text,
  bio                text,
  is_creator         boolean not null default false,
  is_verified_human  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}$')
);
create unique index if not exists profiles_handle_key on public.profiles (handle);

-- stores ---------------------------------------------------------------------
create table if not exists public.stores (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  name             text not null,
  tagline          text not null default '',
  banner_gradient  text not null default 'linear-gradient(135deg,#1a86ff,#9558ff)',
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  hires_count      integer not null default 0,
  rating_avg       numeric(3,2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists stores_slug_key on public.stores (slug);
create index if not exists stores_owner_id_idx on public.stores (owner_id);

-- =============================================================================
-- Immutable text join (needed by the full-text indexes below)
--
-- `array_to_string()` is marked STABLE in Postgres, not IMMUTABLE, so an index
-- expression that calls it is rejected outright:
--   ERROR: functions in index expression must be marked IMMUTABLE
-- This is the standard workaround — a thin IMMUTABLE wrapper. Every expression
-- index below and every search function in 0003/0006 uses it, and they must
-- keep using the *same* expression or the planner stops choosing the index.
-- =============================================================================

create or replace function public.text_join(p_values text[], p_separator text default ' ')
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(array_to_string(p_values, p_separator), '');
$$;

comment on function public.text_join(text[], text) is
  'IMMUTABLE array_to_string, so text[] columns can take part in an expression index.';

-- agents ---------------------------------------------------------------------
create table if not exists public.agents (
  id                    uuid primary key default gen_random_uuid(),
  handle                text not null,
  name                  text not null,
  tagline               text not null default '',
  description           text not null default '',
  avatar_emoji          text not null default '🤖',
  avatar_gradient       text not null default 'linear-gradient(135deg,#18375a,#1f6d8c)',
  owner_id              uuid not null references public.profiles (id) on delete cascade,
  store_id              uuid references public.stores (id) on delete set null,
  category              public.agent_category not null,
  skills                text[] not null default '{}',
  regions               text[] not null default '{}',
  status                public.agent_status not null default 'available',
  room_slug             text,
  pricing_model         public.pricing_model not null default 'per_run',
  starting_price_cents  integer not null default 0 check (starting_price_cents >= 0),
  verified              boolean not null default false,
  rating_avg            numeric(3,2) not null default 0,
  rating_count          integer not null default 0,
  jobs_completed        integer not null default 0,
  repeat_hire_rate      numeric(4,3) not null default 0,
  reliability           numeric(4,3) not null default 0,
  dispute_rate          numeric(4,3) not null default 0,
  avg_latency_sec       integer not null default 0,
  endpoints             jsonb not null default '{}'::jsonb,
  mcp_tools             text[] not null default '{}',
  is_free               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint agents_handle_format check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}$')
);
create unique index if not exists agents_handle_key on public.agents (handle);
create index if not exists agents_owner_id_idx on public.agents (owner_id);
create index if not exists agents_store_id_idx on public.agents (store_id);
create index if not exists agents_category_idx on public.agents (category);
create index if not exists agents_status_idx on public.agents (status);
create index if not exists agents_room_slug_idx on public.agents (room_slug);
create index if not exists agents_price_idx on public.agents (starting_price_cents);
create index if not exists agents_rating_idx on public.agents (rating_avg desc);
create index if not exists agents_skills_idx on public.agents using gin (skills);
create index if not exists agents_regions_idx on public.agents using gin (regions);
create index if not exists agents_search_idx on public.agents using gin (
  to_tsvector(
    'english',
    coalesce(name, '') || ' ' || coalesce(handle, '') || ' ' ||
    coalesce(tagline, '') || ' ' || coalesce(description, '') || ' ' ||
    public.text_join(skills)
  )
);

-- rooms ----------------------------------------------------------------------
create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  name         text not null,
  category     public.agent_category not null,
  description  text not null default '',
  icon         text not null default '🛋️',
  position     integer not null default 0
);
create unique index if not exists rooms_slug_key on public.rooms (slug);

-- presence -------------------------------------------------------------------
create table if not exists public.presence (
  agent_id    uuid primary key references public.agents (id) on delete cascade,
  room_slug   text not null references public.rooms (slug) on update cascade,
  status      public.agent_status not null default 'available',
  capacity    integer not null default 0 check (capacity >= 0),
  queue_len   integer not null default 0 check (queue_len >= 0),
  updated_at  timestamptz not null default now()
);
create index if not exists presence_room_slug_idx on public.presence (room_slug);
create index if not exists presence_status_idx on public.presence (status);

-- gigs -----------------------------------------------------------------------
create table if not exists public.gigs (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null,
  agent_id              uuid not null references public.agents (id) on delete cascade,
  title                 text not null,
  description           text not null default '',
  category              public.agent_category not null,
  tags                  text[] not null default '{}',
  input_contract        jsonb not null default '{}'::jsonb,
  output_contract       jsonb not null default '{}'::jsonb,
  packages              jsonb not null default '[]'::jsonb,
  starting_price_cents  integer not null default 0 check (starting_price_cents >= 0),
  delivery_seconds      integer not null default 60 check (delivery_seconds > 0),
  runs_count            integer not null default 0,
  rating_avg            numeric(3,2) not null default 0,
  rating_count          integer not null default 0,
  status                public.gig_status not null default 'active',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists gigs_slug_key on public.gigs (slug);
create index if not exists gigs_agent_id_idx on public.gigs (agent_id);
create index if not exists gigs_category_idx on public.gigs (category);
create index if not exists gigs_status_idx on public.gigs (status);
create index if not exists gigs_price_idx on public.gigs (starting_price_cents);
create index if not exists gigs_tags_idx on public.gigs using gin (tags);
create index if not exists gigs_search_idx on public.gigs using gin (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
    public.text_join(tags)
  )
);

-- jobs -----------------------------------------------------------------------
-- `awarded_bid_id` points at public.bids, which points back at public.jobs;
-- the foreign key is therefore added after the bids table exists.
create table if not exists public.jobs (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text not null default '',
  category          public.agent_category not null,
  budget_cents      integer not null check (budget_cents >= 0),
  deadline_seconds  integer not null default 86400 check (deadline_seconds > 0),
  required_output   jsonb not null default '{}'::jsonb,
  data_policy       jsonb not null default '{}'::jsonb,
  poster_id         uuid not null references public.profiles (id) on delete cascade,
  status            public.job_status not null default 'open',
  awarded_bid_id    uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists jobs_poster_id_idx on public.jobs (poster_id);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_category_idx on public.jobs (category);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_search_idx on public.jobs using gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- guilds ---------------------------------------------------------------------
create table if not exists public.guilds (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null,
  name                  text not null,
  description           text not null default '',
  pipeline              text not null default '',
  starting_price_cents  integer not null default 0 check (starting_price_cents >= 0),
  rating_avg            numeric(3,2) not null default 0,
  rating_count          integer not null default 0,
  hires_count           integer not null default 0,
  status                public.guild_status not null default 'available',
  owner_id              uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists guilds_slug_key on public.guilds (slug);
create index if not exists guilds_owner_id_idx on public.guilds (owner_id);

create table if not exists public.guild_members (
  guild_id  uuid not null references public.guilds (id) on delete cascade,
  agent_id  uuid not null references public.agents (id) on delete cascade,
  role      text not null default '',
  position  integer not null default 0,
  primary key (guild_id, agent_id)
);
create index if not exists guild_members_agent_id_idx on public.guild_members (agent_id);

-- bids -----------------------------------------------------------------------
create table if not exists public.bids (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs (id) on delete cascade,
  agent_id       uuid not null references public.agents (id) on delete cascade,
  guild_id       uuid references public.guilds (id) on delete set null,
  amount_cents   integer not null check (amount_cents >= 0),
  eta_seconds    integer not null default 60 check (eta_seconds > 0),
  note           text not null default '',
  status         public.bid_status not null default 'pending',
  created_at     timestamptz not null default now()
);
create index if not exists bids_job_id_idx on public.bids (job_id);
create index if not exists bids_agent_id_idx on public.bids (agent_id);
create index if not exists bids_status_idx on public.bids (status);
create index if not exists bids_job_amount_idx on public.bids (job_id, amount_cents);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_awarded_bid_id_fkey'
  ) then
    alter table public.jobs
      add constraint jobs_awarded_bid_id_fkey
      foreign key (awarded_bid_id) references public.bids (id) on delete set null;
  end if;
end
$$;

-- market_items ---------------------------------------------------------------
create table if not exists public.market_items (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  title            text not null,
  description      text not null default '',
  kind             public.market_item_kind not null,
  price_cents      integer not null default 0 check (price_cents >= 0),
  seller_store_id  uuid references public.stores (id) on delete set null,
  verified         boolean not null default false,
  downloads        integer not null default 0,
  tags             text[] not null default '{}',
  icon_emoji       text not null default '📦',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists market_items_slug_key on public.market_items (slug);
create index if not exists market_items_kind_idx on public.market_items (kind);
create index if not exists market_items_store_idx on public.market_items (seller_store_id);
create index if not exists market_items_search_idx on public.market_items using gin (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
    public.text_join(tags)
  )
);

-- channels -------------------------------------------------------------------
create table if not exists public.channels (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null,
  title               text not null,
  description         text not null default '',
  kind                public.channel_kind not null default 'show',
  is_live             boolean not null default false,
  viewers             integer not null default 0,
  thumbnail_gradient  text not null default 'linear-gradient(135deg,#297dff,#df6cff)',
  schedule            text not null default '',
  followers           integer not null default 0,
  owner_id            uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists channels_slug_key on public.channels (slug);
create index if not exists channels_is_live_idx on public.channels (is_live);
create index if not exists channels_kind_idx on public.channels (kind);

create table if not exists public.channel_hosts (
  channel_id  uuid not null references public.channels (id) on delete cascade,
  agent_id    uuid not null references public.agents (id) on delete cascade,
  position    integer not null default 0,
  primary key (channel_id, agent_id)
);
create index if not exists channel_hosts_agent_id_idx on public.channel_hosts (agent_id);

create table if not exists public.channel_chat (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.channels (id) on delete cascade,
  author_name  text not null,
  body         text not null check (length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);
create index if not exists channel_chat_channel_created_idx
  on public.channel_chat (channel_id, created_at desc);

-- competitions ---------------------------------------------------------------
create table if not exists public.competitions (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid not null references public.channels (id) on delete cascade,
  title        text not null,
  task         text not null default '',
  ends_at      timestamptz not null,
  status       public.competition_status not null default 'upcoming',
  prize_cents  integer not null default 0 check (prize_cents >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists competitions_channel_id_idx on public.competitions (channel_id);
create index if not exists competitions_status_idx on public.competitions (status);

create table if not exists public.competition_entries (
  competition_id  uuid not null references public.competitions (id) on delete cascade,
  agent_id        uuid not null references public.agents (id) on delete cascade,
  progress        integer not null default 0 check (progress between 0 and 100),
  accuracy        numeric(4,3) not null default 0,
  primary key (competition_id, agent_id)
);
create index if not exists competition_entries_agent_id_idx
  on public.competition_entries (agent_id);

-- lounge_messages ------------------------------------------------------------
-- `author_id` is polymorphic (a profile or an agent), so it carries no FK.
create table if not exists public.lounge_messages (
  id           uuid primary key default gen_random_uuid(),
  room_slug    text references public.rooms (slug) on update cascade on delete set null,
  author_type  public.author_type not null default 'human',
  author_id    uuid,
  author_name  text not null,
  body         text not null check (length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index if not exists lounge_messages_room_created_idx
  on public.lounge_messages (room_slug, created_at desc);

-- threads / messages ---------------------------------------------------------
create table if not exists public.threads (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  agent_id      uuid references public.agents (id) on delete set null,
  subject       text not null default '',
  unread_count  integer not null default 0 check (unread_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists threads_profile_id_idx on public.threads (profile_id, updated_at desc);
create index if not exists threads_agent_id_idx on public.threads (agent_id);

create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.threads (id) on delete cascade,
  sender_type  public.author_type not null default 'human',
  sender_id    uuid,
  sender_name  text not null,
  body         text not null check (length(body) between 1 and 4000),
  created_at   timestamptz not null default now()
);
create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at);

-- wallets --------------------------------------------------------------------
create table if not exists public.wallets (
  profile_id                    uuid primary key references public.profiles (id) on delete cascade,
  balance_cents                 integer not null default 0,
  held_cents                    integer not null default 0 check (held_cents >= 0),
  spend_today_cents             integer not null default 0 check (spend_today_cents >= 0),
  -- The UTC day `spend_today_cents` counts. It is deliberately NOT `updated_at`:
  -- every unrelated wallet write (a top-up, a policy save, the Command Center
  -- pause) bumps that column, which silently carried yesterday's spend forward
  -- into today's autonomous ceiling. See 0008_integrity.sql.
  spend_today_date              date not null default (now() at time zone 'utc')::date,
  approval_threshold_cents      integer not null default 500 check (approval_threshold_cents >= 0),
  autonomous_spend_limit_cents  integer not null default 500 check (autonomous_spend_limit_cents >= 0),
  -- The Command Center kill switch. Server state, not a browser preference, so
  -- every caller — the site, an API key, an MCP client — sees the same answer.
  -- A zero limit means "no unattended spend at all", never "no ceiling".
  autonomous_paused             boolean not null default false,
  updated_at                    timestamptz not null default now()
);

-- orders ---------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references public.profiles (id) on delete cascade,
  agent_id        uuid not null references public.agents (id) on delete restrict,
  gig_id          uuid references public.gigs (id) on delete set null,
  job_id          uuid references public.jobs (id) on delete set null,
  bid_id          uuid references public.bids (id) on delete set null,
  package_tier    public.package_tier,
  brief           text not null default '',
  amount_cents    integer not null check (amount_cents >= 0),
  status          public.order_status not null default 'queued',
  progress        integer not null default 0 check (progress between 0 and 100),
  eta_seconds     integer not null default 60 check (eta_seconds > 0),
  started_at      timestamptz,
  delivered_at    timestamptz,
  output          jsonb,
  cost_breakdown  jsonb,
  audit_log       jsonb[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
  -- Deliberately no "gig_id or job_id must be set" constraint: @World assembles
  -- guild runs that belong to neither a listed gig nor a posted job.
);
create index if not exists orders_buyer_id_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_agent_id_idx on public.orders (agent_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_gig_id_idx on public.orders (gig_id);
create index if not exists orders_job_id_idx on public.orders (job_id);

-- wallet_transactions --------------------------------------------------------
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  kind          public.transaction_kind not null,
  amount_cents  integer not null,
  order_id      uuid references public.orders (id) on delete set null,
  memo          text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists wallet_transactions_profile_created_idx
  on public.wallet_transactions (profile_id, created_at desc);
create index if not exists wallet_transactions_order_id_idx
  on public.wallet_transactions (order_id);

-- reviews --------------------------------------------------------------------
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references public.orders (id) on delete set null,
  agent_id     uuid not null references public.agents (id) on delete cascade,
  reviewer_id  uuid not null references public.profiles (id) on delete cascade,
  rating       integer not null check (rating between 1 and 5),
  body         text not null default '',
  created_at   timestamptz not null default now()
);
create unique index if not exists reviews_order_id_key
  on public.reviews (order_id) where order_id is not null;
create index if not exists reviews_agent_created_idx
  on public.reviews (agent_id, created_at desc);
create index if not exists reviews_reviewer_id_idx on public.reviews (reviewer_id);

-- events ---------------------------------------------------------------------
-- `actor_id` is polymorphic (profile, agent or null for system), so no FK.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  kind        public.event_kind not null,
  actor_type  public.author_type not null default 'agent',
  actor_id    uuid,
  actor_name  text not null,
  headline    text not null,
  body        text not null default '',
  cta_label   text,
  cta_href    text,
  created_at  timestamptz not null default now()
);
create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_kind_idx on public.events (kind);

-- api_keys -------------------------------------------------------------------
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  label         text not null default 'API key',
  key_hash      text not null,
  key_prefix    text not null,
  scopes        text[] not null default '{}',
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists api_keys_key_hash_key on public.api_keys (key_hash);
create index if not exists api_keys_profile_id_idx on public.api_keys (profile_id);

-- =============================================================================
-- pg_trgm indexes for fuzzy handle / slug / title lookup
--
-- pg_trgm's operator classes live in whichever schema the extension was
-- installed into, so the index DDL is built dynamically rather than hard-coding
-- `extensions.gin_trgm_ops`.
-- =============================================================================

do $$
declare
  trgm_schema text;
begin
  select n.nspname into trgm_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if trgm_schema is null then
    raise notice 'pg_trgm not installed — skipping trigram indexes';
    return;
  end if;

  execute format(
    'create index if not exists agents_handle_trgm_idx on public.agents using gin (handle %I.gin_trgm_ops)',
    trgm_schema
  );
  execute format(
    'create index if not exists agents_name_trgm_idx on public.agents using gin (name %I.gin_trgm_ops)',
    trgm_schema
  );
  execute format(
    'create index if not exists gigs_title_trgm_idx on public.gigs using gin (title %I.gin_trgm_ops)',
    trgm_schema
  );
  execute format(
    'create index if not exists jobs_title_trgm_idx on public.jobs using gin (title %I.gin_trgm_ops)',
    trgm_schema
  );
  execute format(
    'create index if not exists market_items_title_trgm_idx on public.market_items using gin (title %I.gin_trgm_ops)',
    trgm_schema
  );
end
$$;

-- =============================================================================
-- updated_at triggers
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','stores','agents','gigs','jobs','guilds','market_items',
    'channels','threads','wallets','orders','presence'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end
$$;

-- =============================================================================
-- profiles.id → auth.users.id
--
-- Guarded so this migration also loads on a plain Postgres database (no auth
-- schema). On Supabase the constraint is always created.
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  )
  and not exists (
    select 1 from pg_constraint where conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users (id) on delete cascade;
  end if;
end
$$;
