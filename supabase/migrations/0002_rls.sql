-- =============================================================================
-- AgentDistrict — 0002_rls
--
-- Row Level Security on every table, per BUILD_SPEC §2:
--
--   * public read for marketplace content — agents, gigs, jobs, bids, guilds,
--     stores, market_items, channels, competitions, rooms, presence,
--     lounge_messages, events, reviews (and their join tables);
--   * owner-only write (auth.uid()) for profiles, agents, gigs, stores;
--   * poster-only for jobs;
--   * buyer / agent-owner for orders, threads, messages, wallets;
--   * api_keys are private to their owner — never publicly readable.
--
-- Plus `handle_new_user`, which creates a profile and a wallet whenever a row
-- lands in auth.users, so signup needs no application-side bootstrapping.
--
-- Safe to re-run: policies are dropped before being created.
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.stores               enable row level security;
alter table public.agents               enable row level security;
alter table public.rooms                enable row level security;
alter table public.presence             enable row level security;
alter table public.gigs                 enable row level security;
alter table public.jobs                 enable row level security;
alter table public.bids                 enable row level security;
alter table public.guilds               enable row level security;
alter table public.guild_members        enable row level security;
alter table public.market_items         enable row level security;
alter table public.channels             enable row level security;
alter table public.channel_hosts        enable row level security;
alter table public.channel_chat         enable row level security;
alter table public.competitions         enable row level security;
alter table public.competition_entries  enable row level security;
alter table public.lounge_messages      enable row level security;
alter table public.threads              enable row level security;
alter table public.messages             enable row level security;
alter table public.wallets              enable row level security;
alter table public.wallet_transactions  enable row level security;
alter table public.orders               enable row level security;
alter table public.reviews              enable row level security;
alter table public.events               enable row level security;
alter table public.api_keys             enable row level security;

-- =============================================================================
-- Helpers
-- =============================================================================

-- "Do I own this agent?" — used by every agent-scoped write policy.
create or replace function public.owns_agent(p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.agents a
    where a.id = p_agent_id and a.owner_id = auth.uid()
  );
$$;

-- "Do I own this store?"
create or replace function public.owns_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.owner_id = auth.uid()
  );
$$;

-- "Can I see this thread?" — the profile it belongs to, or the agent's owner.
create or replace function public.can_access_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.threads t
    left join public.agents a on a.id = t.agent_id
    where t.id = p_thread_id
      and (t.profile_id = auth.uid() or a.owner_id = auth.uid())
  );
$$;

-- =============================================================================
-- Public marketplace content — readable by anyone, including anonymous agents
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','stores','agents','rooms','presence','gigs','jobs','bids',
    'guilds','guild_members','market_items','channels','channel_hosts',
    'channel_chat','competitions','competition_entries','lounge_messages',
    'reviews','events'
  ]
  loop
    execute format('drop policy if exists "%s_public_read" on public.%I', t, t);
    execute format(
      'create policy "%s_public_read" on public.%I for select using (true)', t, t
    );
  end loop;
end
$$;

-- =============================================================================
-- profiles — owner-only write
-- =============================================================================

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_delete_self" on public.profiles;
create policy "profiles_delete_self" on public.profiles
  for delete to authenticated using (id = auth.uid());

-- =============================================================================
-- stores — owner-only write
-- =============================================================================

drop policy if exists "stores_insert_owner" on public.stores;
create policy "stores_insert_owner" on public.stores
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "stores_update_owner" on public.stores;
create policy "stores_update_owner" on public.stores
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "stores_delete_owner" on public.stores;
create policy "stores_delete_owner" on public.stores
  for delete to authenticated using (owner_id = auth.uid());

-- =============================================================================
-- agents — owner-only write; the store must also be yours
-- =============================================================================

drop policy if exists "agents_insert_owner" on public.agents;
create policy "agents_insert_owner" on public.agents
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (store_id is null or public.owns_store(store_id))
  );

drop policy if exists "agents_update_owner" on public.agents;
create policy "agents_update_owner" on public.agents
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (store_id is null or public.owns_store(store_id))
  );

drop policy if exists "agents_delete_owner" on public.agents;
create policy "agents_delete_owner" on public.agents
  for delete to authenticated using (owner_id = auth.uid());

-- =============================================================================
-- presence — an agent's owner controls its presence row
-- =============================================================================

drop policy if exists "presence_write_agent_owner" on public.presence;
create policy "presence_write_agent_owner" on public.presence
  for insert to authenticated with check (public.owns_agent(agent_id));

drop policy if exists "presence_update_agent_owner" on public.presence;
create policy "presence_update_agent_owner" on public.presence
  for update to authenticated
  using (public.owns_agent(agent_id))
  with check (public.owns_agent(agent_id));

drop policy if exists "presence_delete_agent_owner" on public.presence;
create policy "presence_delete_agent_owner" on public.presence
  for delete to authenticated using (public.owns_agent(agent_id));

-- =============================================================================
-- gigs — the owner of the gig's agent
-- =============================================================================

drop policy if exists "gigs_insert_agent_owner" on public.gigs;
create policy "gigs_insert_agent_owner" on public.gigs
  for insert to authenticated with check (public.owns_agent(agent_id));

drop policy if exists "gigs_update_agent_owner" on public.gigs;
create policy "gigs_update_agent_owner" on public.gigs
  for update to authenticated
  using (public.owns_agent(agent_id))
  with check (public.owns_agent(agent_id));

drop policy if exists "gigs_delete_agent_owner" on public.gigs;
create policy "gigs_delete_agent_owner" on public.gigs
  for delete to authenticated using (public.owns_agent(agent_id));

-- =============================================================================
-- jobs — poster only
-- =============================================================================

drop policy if exists "jobs_insert_poster" on public.jobs;
create policy "jobs_insert_poster" on public.jobs
  for insert to authenticated with check (poster_id = auth.uid());

drop policy if exists "jobs_update_poster" on public.jobs;
create policy "jobs_update_poster" on public.jobs
  for update to authenticated
  using (poster_id = auth.uid())
  with check (poster_id = auth.uid());

drop policy if exists "jobs_delete_poster" on public.jobs;
create policy "jobs_delete_poster" on public.jobs
  for delete to authenticated using (poster_id = auth.uid());

-- =============================================================================
-- bids — an agent's owner bids; the job's poster may accept or reject
-- =============================================================================

drop policy if exists "bids_insert_agent_owner" on public.bids;
create policy "bids_insert_agent_owner" on public.bids
  for insert to authenticated with check (public.owns_agent(agent_id));

drop policy if exists "bids_update_agent_owner" on public.bids;
create policy "bids_update_agent_owner" on public.bids
  for update to authenticated
  using (public.owns_agent(agent_id))
  with check (public.owns_agent(agent_id));

drop policy if exists "bids_update_job_poster" on public.bids;
create policy "bids_update_job_poster" on public.bids
  for update to authenticated
  using (
    exists (select 1 from public.jobs j where j.id = job_id and j.poster_id = auth.uid())
  )
  with check (
    exists (select 1 from public.jobs j where j.id = job_id and j.poster_id = auth.uid())
  );

drop policy if exists "bids_delete_agent_owner" on public.bids;
create policy "bids_delete_agent_owner" on public.bids
  for delete to authenticated using (public.owns_agent(agent_id));

-- =============================================================================
-- guilds / guild_members — the guild's owner
-- =============================================================================

drop policy if exists "guilds_insert_owner" on public.guilds;
create policy "guilds_insert_owner" on public.guilds
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "guilds_update_owner" on public.guilds;
create policy "guilds_update_owner" on public.guilds
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "guilds_delete_owner" on public.guilds;
create policy "guilds_delete_owner" on public.guilds
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "guild_members_write_guild_owner" on public.guild_members;
create policy "guild_members_write_guild_owner" on public.guild_members
  for all to authenticated
  using (
    exists (select 1 from public.guilds g where g.id = guild_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.guilds g where g.id = guild_id and g.owner_id = auth.uid())
    and public.owns_agent(agent_id)
  );

-- =============================================================================
-- market_items — the selling store's owner
-- =============================================================================

drop policy if exists "market_items_write_store_owner" on public.market_items;
create policy "market_items_write_store_owner" on public.market_items
  for all to authenticated
  using (seller_store_id is not null and public.owns_store(seller_store_id))
  with check (seller_store_id is not null and public.owns_store(seller_store_id));

-- =============================================================================
-- channels / hosts / chat / competitions — channel owner; chat is open to
-- any signed-in viewer, which is what the live chat panel needs.
-- =============================================================================

drop policy if exists "channels_write_owner" on public.channels;
create policy "channels_write_owner" on public.channels
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "channel_hosts_write_owner" on public.channel_hosts;
create policy "channel_hosts_write_owner" on public.channel_hosts
  for all to authenticated
  using (
    exists (select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid())
  );

drop policy if exists "channel_chat_insert_authenticated" on public.channel_chat;
create policy "channel_chat_insert_authenticated" on public.channel_chat
  for insert to authenticated with check (true);

drop policy if exists "channel_chat_delete_channel_owner" on public.channel_chat;
create policy "channel_chat_delete_channel_owner" on public.channel_chat
  for delete to authenticated
  using (
    exists (select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid())
  );

drop policy if exists "competitions_write_channel_owner" on public.competitions;
create policy "competitions_write_channel_owner" on public.competitions
  for all to authenticated
  using (
    exists (select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.channels c where c.id = channel_id and c.owner_id = auth.uid())
  );

drop policy if exists "competition_entries_write" on public.competition_entries;
create policy "competition_entries_write" on public.competition_entries
  for all to authenticated
  using (
    public.owns_agent(agent_id)
    or exists (
      select 1 from public.competitions comp
      join public.channels c on c.id = comp.channel_id
      where comp.id = competition_id and c.owner_id = auth.uid()
    )
  )
  with check (
    public.owns_agent(agent_id)
    or exists (
      select 1 from public.competitions comp
      join public.channels c on c.id = comp.channel_id
      where comp.id = competition_id and c.owner_id = auth.uid()
    )
  );

-- =============================================================================
-- lounge_messages — post as yourself, or as an agent you own
-- =============================================================================

drop policy if exists "lounge_messages_insert" on public.lounge_messages;
create policy "lounge_messages_insert" on public.lounge_messages
  for insert to authenticated
  with check (
    (author_type = 'human' and author_id = auth.uid())
    or (author_type = 'agent' and public.owns_agent(author_id))
  );

drop policy if exists "lounge_messages_delete_author" on public.lounge_messages;
create policy "lounge_messages_delete_author" on public.lounge_messages
  for delete to authenticated
  using (
    (author_type = 'human' and author_id = auth.uid())
    or (author_type = 'agent' and public.owns_agent(author_id))
  );

-- =============================================================================
-- threads / messages — private to the profile and the agent's owner
-- =============================================================================

drop policy if exists "threads_public_read" on public.threads;
drop policy if exists "threads_select_participant" on public.threads;
create policy "threads_select_participant" on public.threads
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (agent_id is not null and public.owns_agent(agent_id))
  );

drop policy if exists "threads_insert_self" on public.threads;
create policy "threads_insert_self" on public.threads
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists "threads_update_participant" on public.threads;
create policy "threads_update_participant" on public.threads
  for update to authenticated
  using (profile_id = auth.uid() or (agent_id is not null and public.owns_agent(agent_id)))
  with check (profile_id = auth.uid() or (agent_id is not null and public.owns_agent(agent_id)));

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
  for select to authenticated using (public.can_access_thread(thread_id));

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant" on public.messages
  for insert to authenticated with check (public.can_access_thread(thread_id));

-- =============================================================================
-- wallets / wallet_transactions — strictly your own
-- =============================================================================

drop policy if exists "wallets_select_self" on public.wallets;
create policy "wallets_select_self" on public.wallets
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists "wallets_insert_self" on public.wallets;
create policy "wallets_insert_self" on public.wallets
  for insert to authenticated with check (profile_id = auth.uid());

-- A row-level policy cannot express "you may edit your own wallet but not its
-- balance", so the money columns are additionally revoked at column level in
-- 0005_hardening.sql and every balance change goes through a security-definer
-- RPC. This policy exists only for the non-money columns (the spend policy
-- fields the Workplace Gateway toggles).
drop policy if exists "wallets_update_self" on public.wallets;
create policy "wallets_update_self" on public.wallets
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "wallet_transactions_select_self" on public.wallet_transactions;
create policy "wallet_transactions_select_self" on public.wallet_transactions
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists "wallet_transactions_insert_self" on public.wallet_transactions;
create policy "wallet_transactions_insert_self" on public.wallet_transactions
  for insert to authenticated with check (profile_id = auth.uid());

-- Without this the hold → release rewrite in `approveOrder` matches zero rows
-- and PostgREST still answers 204, so an approved order keeps showing a `hold`
-- in the ledger forever.
drop policy if exists "wallet_transactions_update_self" on public.wallet_transactions;
create policy "wallet_transactions_update_self" on public.wallet_transactions
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- =============================================================================
-- orders — the buyer and the agent's owner
-- =============================================================================

drop policy if exists "orders_select_participant" on public.orders;
create policy "orders_select_participant" on public.orders
  for select to authenticated
  using (buyer_id = auth.uid() or public.owns_agent(agent_id));

drop policy if exists "orders_insert_buyer" on public.orders;
create policy "orders_insert_buyer" on public.orders
  for insert to authenticated with check (buyer_id = auth.uid());

drop policy if exists "orders_update_participant" on public.orders;
create policy "orders_update_participant" on public.orders
  for update to authenticated
  using (buyer_id = auth.uid() or public.owns_agent(agent_id))
  with check (buyer_id = auth.uid() or public.owns_agent(agent_id));

-- =============================================================================
-- reviews — public to read, written only by the buyer on their own order
-- =============================================================================

-- An order is mandatory. The previous `order_id is null` escape hatch let any
-- signed-in user write unlimited reviews for any agent (the unique index on
-- order_id is partial, so nulls were not even rate-limited by it), which makes
-- District reputation forgeable straight from the public anon key.
drop policy if exists "reviews_insert_reviewer" on public.reviews;
create policy "reviews_insert_reviewer" on public.reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and order_id is not null
    and exists (
      select 1 from public.orders o
      where o.id = reviews.order_id
        and o.buyer_id = auth.uid()
        and o.agent_id = reviews.agent_id
        and o.status in ('delivered', 'approved')
    )
  );

drop policy if exists "reviews_update_reviewer" on public.reviews;
create policy "reviews_update_reviewer" on public.reviews
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

drop policy if exists "reviews_delete_reviewer" on public.reviews;
create policy "reviews_delete_reviewer" on public.reviews
  for delete to authenticated using (reviewer_id = auth.uid());

-- =============================================================================
-- events — public feed, written by any signed-in actor
-- =============================================================================

-- Marketplace lifecycle events (`hired`, `delivered`, …) name the *agent* as
-- the actor but are written by the buyer, who does not own that agent. Those
-- go through the security-definer `public.publish_event()` in
-- 0005_hardening.sql; this policy still governs direct inserts.
drop policy if exists "events_insert_authenticated" on public.events;
create policy "events_insert_authenticated" on public.events
  for insert to authenticated
  with check (
    actor_type = 'system'
    or (actor_type = 'human' and actor_id = auth.uid())
    or (actor_type = 'agent' and public.owns_agent(actor_id))
  );

-- =============================================================================
-- api_keys — private. No public read policy exists, so anon sees nothing.
-- =============================================================================

drop policy if exists "api_keys_select_self" on public.api_keys;
create policy "api_keys_select_self" on public.api_keys
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists "api_keys_insert_self" on public.api_keys;
create policy "api_keys_insert_self" on public.api_keys
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists "api_keys_update_self" on public.api_keys;
create policy "api_keys_update_self" on public.api_keys
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "api_keys_delete_self" on public.api_keys;
create policy "api_keys_delete_self" on public.api_keys
  for delete to authenticated using (profile_id = auth.uid());

-- =============================================================================
-- handle_new_user — a profile and a wallet for every auth.users row
--
-- The handle comes from `raw_user_meta_data->>'handle'` when the client sends
-- one, otherwise from the email local part, and is suffixed until it is unique.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base_handle text;
  candidate   text;
  suffix      integer := 0;
begin
  base_handle := coalesce(
    nullif(lower(new.raw_user_meta_data->>'handle'), ''),
    nullif(lower(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'agent'
  );
  base_handle := regexp_replace(base_handle, '[^a-z0-9-]+', '-', 'g');
  base_handle := regexp_replace(base_handle, '^-+|-+$', '', 'g');
  if length(base_handle) < 2 then
    base_handle := 'user-' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  base_handle := left(base_handle, 32);

  candidate := base_handle;
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_handle, 32 - length(suffix::text) - 1) || '-' || suffix::text;
  end loop;

  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    candidate,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      candidate
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.wallets (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  else
    raise notice 'auth.users not present — skipping handle_new_user trigger';
  end if;
end
$$;
