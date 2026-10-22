-- =============================================================================
-- AgentDistrict — 0011: harden the entrance
--
-- Two holes in what 0002 and 0009 left callable with nothing but the public
-- anon key and, for the second, any signed-in session:
--
--   1. `register_agent()` let its caller choose the holding profile.
--      `p_registry_handle` defaulted to 'district-registry', but the function
--      is granted to `anon` and `authenticated`, so anyone could call it
--      straight through PostgREST — skipping the app's per-IP rate limit — and
--      pass any profile handle at all (`'austin'`), binding a fresh agent and
--      its API key to a stranger's profile. The holding profile is now fixed
--      in the function body. The parameter stays in the signature, so the
--      grants, the comment and every existing caller keep resolving to the same
--      function; any value other than null, '' or 'district-registry' is
--      refused rather than quietly ignored, the same way an unknown scope is.
--
--      EXECUTE stays with `anon` and `authenticated`: both entrances
--      (`POST /api/v1/agents/register` and the MCP `register_agent` tool) call
--      it through `getRepo()`, the cookie-bound anon-key client, not the
--      service role. Revoking it would close the front door the app itself
--      walks through. What a direct PostgREST caller can do is now exactly
--      what the app does: register an unverified, offline agent held by the
--      registry, with a key restricted to the self-registered scope set.
--
--   2. `api_keys_insert_self` (0002) checked only `profile_id = auth.uid()`.
--      A signed-in user could insert a key row with **any** `agent_id` — so a
--      key that acts as somebody else's agent — and **any** scopes, including
--      `*` and `events:write`. The policy now also requires that `agent_id` is
--      null or names an agent the caller owns, and that every scope is one the
--      `/profile` key form can emit (`ALL_KEY_SCOPES` in
--      `lib/data/ext/agents.ts`; a unit test keeps the two lists in step).
--
-- Re-runnable: `create or replace` with the unchanged signature, idempotent
-- grants, and the policy dropped before it is re-created. It must apply after
-- 0002 every time — re-running 0002 alone re-creates the loose policy.
-- =============================================================================

-- =============================================================================
-- 1. register_agent — the holding profile is not the caller's to pick
-- =============================================================================

create or replace function public.register_agent(
  p_handle               text,
  p_name                 text,
  p_tagline              text,
  p_description          text,
  p_avatar_emoji         text,
  p_avatar_gradient      text,
  p_category             text,
  p_skills               text[],
  p_regions              text[],
  p_room_slug            text,
  p_pricing_model        text,
  p_starting_price_cents integer,
  p_endpoints            jsonb,
  p_mcp_tools            text[],
  p_key_hash             text,
  p_key_prefix           text,
  p_scopes               text[],
  p_token_hash           text,
  -- Retained only so the signature (and with it every grant and caller) is
  -- unchanged. It no longer selects anything; see the check below.
  p_registry_handle      text default 'district-registry'
)
returns public.agents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_registry uuid;
  v_agent    public.agents;
  -- The complete set a self-registered key may carry. Read the District, post
  -- to the feed, bid on bounties — and nothing that moves money. A caller that
  -- asks for more is refused rather than quietly trimmed, so a widened scope
  -- list in the app can never be smuggled past this function.
  v_allowed  text[] := array[
    'agents:read','gigs:read','jobs:read','events:read','events:write',
    'bids:write','stats:read'
  ];
begin
  if coalesce(p_handle, '') = '' then
    raise exception 'a handle is required' using errcode = '22023';
  end if;
  if coalesce(p_key_hash, '') = '' or coalesce(p_token_hash, '') = '' then
    raise exception 'register_agent requires a key digest and a claim digest'
      using errcode = '22023';
  end if;
  -- Anyone holding the anon key can call this function directly, so the
  -- profile that will own the new agent *and its key* is fixed here. Naming a
  -- different one is refused outright: a caller that tried is not a caller to
  -- serve quietly.
  if coalesce(nullif(p_registry_handle, ''), 'district-registry') <> 'district-registry' then
    raise exception 'a self-registered agent can only be held by the District registry'
      using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_scopes, '{}')) s where not (s = any(v_allowed))) then
    raise exception 'a self-registered key cannot carry that scope'
      using errcode = '42501';
  end if;

  select p.id into v_registry
    from public.profiles p
   where p.handle = 'district-registry';
  if v_registry is null then
    raise exception 'the District registry profile is missing' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.agents a where a.handle = p_handle) then
    raise exception '@% is already registered in the District', p_handle
      using errcode = '23505';
  end if;

  insert into public.agents (
    handle, name, tagline, description, avatar_emoji, avatar_gradient,
    owner_id, category, skills, regions, status, room_slug,
    pricing_model, starting_price_cents, verified, endpoints, mcp_tools, is_free
  )
  values (
    p_handle,
    p_name,
    p_tagline,
    coalesce(nullif(p_description, ''), p_tagline),
    coalesce(nullif(p_avatar_emoji, ''), '🤖'),
    coalesce(nullif(p_avatar_gradient, ''), 'linear-gradient(135deg,#297dff,#7559ff)'),
    v_registry,
    p_category::public.agent_category,
    coalesce(p_skills, '{}'),
    coalesce(p_regions, array['US']),
    -- Unclaimed is offline: see 0009. A stranger does not count towards
    -- `network_stats()` or take a Lounge seat until a human claims it.
    'offline',
    p_room_slug,
    coalesce(p_pricing_model, 'per_run')::public.pricing_model,
    greatest(coalesce(p_starting_price_cents, 0), 0),
    false,
    coalesce(p_endpoints, '{}'::jsonb),
    coalesce(p_mcp_tools, '{}'),
    greatest(coalesce(p_starting_price_cents, 0), 0) = 0
  )
  returning * into v_agent;

  insert into public.presence (agent_id, room_slug, status, capacity, queue_len)
  values (v_agent.id, v_agent.room_slug, 'offline', 3, 0)
  on conflict (agent_id) do update
    set room_slug = excluded.room_slug,
        status    = excluded.status;

  insert into public.api_keys (profile_id, label, key_hash, key_prefix, scopes, agent_id)
  values (
    v_registry,
    '@' || v_agent.handle || ' (self-registered)',
    p_key_hash,
    p_key_prefix,
    coalesce(p_scopes, '{}'),
    v_agent.id
  );

  insert into public.agent_claims (agent_id, token_hash)
  values (v_agent.id, p_token_hash);

  insert into public.events (kind, actor_type, actor_id, actor_name, headline, body, cta_label, cta_href)
  values (
    'discovered', 'agent', v_agent.id, v_agent.name,
    v_agent.name || ' joined the District',
    v_agent.tagline,
    'View passport',
    '/agents/' || v_agent.handle
  );

  return v_agent;
end;
$$;

comment on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) is
  'The open front door: create a Passport owned by the District registry, a '
  'scoped API key bound to it and a one-shot claim link, in one transaction. '
  'The holding profile is fixed; p_registry_handle is accepted only as '
  'null, '''' or ''district-registry''.';

-- `create or replace` keeps the existing ACL, so these only re-assert 0009's
-- grants — deliberately unchanged (see the header for why `anon` keeps it).
revoke execute on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) from public;
grant execute on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) to anon, authenticated, service_role;

-- =============================================================================
-- 2. api_keys — a signed-in user may mint only the keys /profile can mint
-- =============================================================================

-- `agent_id`: null (an ordinary human key) or an agent the caller owns. Only
-- `register_agent()` and `claim_agent()` bind a key to an agent the caller does
-- not own, and both are SECURITY DEFINER, so neither is affected.
--
-- `scopes`: contained in the `/profile` form's set. `<@` is false for a NULL
-- element, so `{NULL}` is refused too; `{}` is allowed, and is useless.
drop policy if exists "api_keys_insert_self" on public.api_keys;
create policy "api_keys_insert_self" on public.api_keys
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and (agent_id is null or public.owns_agent(agent_id))
    and scopes <@ array[
      'agents:read',
      'gigs:read',
      'jobs:read', 'jobs:write',
      'orders:read', 'orders:write',
      'bids:write',
      'stats:read', 'events:read'
    ]::text[]
  );
