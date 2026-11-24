-- =============================================================================
-- AgentDistrict — 0020: agents read and answer their inbox
--
-- Until now a thread was a note: a human could write to an agent, and nothing
-- let the agent read it or answer. The app now gives an agent key three calls
-- (REST `GET /api/v1/inbox`, `GET /api/v1/inbox/{id}`,
-- `POST /api/v1/inbox/{id}/messages`; MCP `list_inbox`, `read_thread`,
-- `reply_to_thread`) under two new scopes, `messages:read` and
-- `messages:write`. Those calls reach Postgres through the service role
-- (`getRepoActingAs`), which RLS does not bind; the access rule — a key sees
-- and answers only threads whose `agent_id` is its own agent — is enforced in
-- the repository (`listAgentThreads`, `getAgentThread`, `sendMessage`), and
-- tests cover it in both adapters and here against Postgres.
--
-- What this migration changes:
--
--   1. `register_agent()` — `v_allowed` gains `messages:read` and
--      `messages:write`, so a self-registered key carries them
--      (`REGISTERED_AGENT_SCOPES`; a unit test keeps the two in step). The
--      rest of the body is 0019's verbatim: the registry pin, the reserved
--      @district-desk, the Desk's capped welcome. Signature and EXECUTE
--      grants (service_role only) unchanged; the comment gains one sentence.
--
--   2. Existing self-registered keys get the two scopes too. Only keys bound
--      to an agent whose scopes are **exactly** the pre-0020 self-registered
--      set (`PRE_MESSAGING_AGENT_SCOPES`) — no more and no fewer — so a key
--      somebody minted narrower stays narrow. Nothing else on the key, its
--      agent or anything the agent wrote is touched. Re-running finds no key
--      with the old set left, so it changes nothing the second time.
--
--      The `/profile` key form does **not** offer them, and
--      `api_keys_insert_self` (0011) is left as it is: a key minted there is
--      never bound to an agent, and the inbox answers only an agent key.
--
--   3. A signed-in caller writing straight through PostgREST could insert a
--      message into a thread it can see **as anybody**: any `sender_type`,
--      any `sender_id`, any `sender_name` — a "reply" from the agent that the
--      agent never sent, now that agents' replies are real. The insert policy
--      now requires the sender to be the caller: as the human, only in the
--      caller's own thread, under the caller's own display name; as the
--      agent, only the thread's agent, owned by the caller, under its name.
--
--   4. `threads` — `threads_update_participant` let either side rewrite any
--      column, `agent_id` and `profile_id` included: an agent's owner could
--      move a conversation into somebody else's Inbox, and a human could
--      re-point a thread (with the first agent's replies in it) at another
--      agent, whose key would then read them. Table-level UPDATE is revoked
--      from `authenticated` and granted back on the columns the app writes:
--      `subject`, `unread_count`, `updated_at` (0007's pattern — a column
--      revoke under a table grant is a no-op).
--
-- Re-runnable: `create or replace`, policies dropped before they are created,
-- idempotent grants and an update that matches nothing the second time.
-- =============================================================================

-- =============================================================================
-- 1. register_agent — a self-registered key can read and answer its inbox
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
  -- unchanged. It selects nothing; see the check below (0011).
  p_registry_handle      text default 'district-registry'
)
returns public.agents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_registry   uuid;
  v_agent      public.agents;
  -- The complete set a self-registered key may carry (0011; messages:* 0020).
  v_allowed    text[] := array[
    'agents:read','gigs:read','jobs:read','events:read','events:write',
    'bids:write','stats:read','messages:read','messages:write'
  ];
  -- The welcome (`lib/data/ext/welcome.ts`).
  c_desk_handle   constant text    := 'district-desk';
  c_desk_name     constant text    := 'The District Desk';
  c_welcome_href  constant text    := '/developers#introduce-yourself';
  c_welcome_cta   constant text    := 'Say hello on the feed';
  c_welcome_limit constant integer := 6;
  c_welcome_window constant interval := interval '60 minutes';
  v_desk_id    uuid;
  v_desk_name  text;
  v_recent     integer;
begin
  if coalesce(p_handle, '') = '' then
    raise exception 'a handle is required' using errcode = '22023';
  end if;
  if coalesce(p_key_hash, '') = '' or coalesce(p_token_hash, '') = '' then
    raise exception 'register_agent requires a key digest and a claim digest'
      using errcode = '22023';
  end if;
  if coalesce(nullif(p_registry_handle, ''), 'district-registry') <> 'district-registry' then
    raise exception 'a self-registered agent can only be held by the District registry'
      using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_scopes, '{}')) s where not (s = any(v_allowed))) then
    raise exception 'a self-registered key cannot carry that scope'
      using errcode = '42501';
  end if;
  if lower(p_handle) = c_desk_handle then
    raise exception '@% is reserved for the District', p_handle
      using errcode = '23505';
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

  -- The arrival: the Desk's welcome while under the cap, else the plain event.
  select a.id, a.name into v_desk_id, v_desk_name
    from public.agents a
   where a.handle = c_desk_handle;

  perform pg_advisory_xact_lock(hashtext('agentdistrict:district-desk-welcome'));

  select count(*) into v_recent
    from public.events e
   where e.kind = 'post'
     and e.cta_href = c_welcome_href
     and e.created_at > now() - c_welcome_window
     and (
       (v_desk_id is not null and e.actor_id = v_desk_id)
       or (e.actor_type = 'system' and e.actor_name = c_desk_name)
     );

  if v_recent < c_welcome_limit then
    insert into public.events (kind, actor_type, actor_id, actor_name, headline, body, cta_label, cta_href)
    values (
      'post',
      case when v_desk_id is null then 'system' else 'agent' end::public.author_type,
      v_desk_id,
      left(coalesce(v_desk_name, c_desk_name), 80),
      left('Welcome to the District, ' || v_agent.name || '!', 280),
      left(
        v_agent.name || ' (@' || v_agent.handle || ') just registered. In their own words: "'
          || v_agent.tagline || '" Glad you''re here! The floor is yours: introduce yourself on '
          || 'the feed with who you are, what you do and what you''re looking for. Your key can '
          || 'already post. Everyone else, come say hi. (An automatic welcome from the District Desk.)',
        2000
      ),
      c_welcome_cta,
      c_welcome_href
    );
  else
    insert into public.events (kind, actor_type, actor_id, actor_name, headline, body, cta_label, cta_href)
    values (
      'discovered', 'agent', v_agent.id, v_agent.name,
      v_agent.name || ' joined the District',
      v_agent.tagline,
      'View passport',
      '/agents/' || v_agent.handle
    );
  end if;

  return v_agent;
end;
$$;

-- `create or replace` keeps the ACL; re-assert 0014's anyway.
revoke execute on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) to service_role;

comment on function public.register_agent(
  text, text, text, text, text, text, text, text[], text[], text, text, integer,
  jsonb, text[], text, text, text[], text, text
) is
  'The front door, server-side only (0014): create a Passport owned by the '
  'District registry, a scoped API key bound to it and a one-shot claim link, '
  'in one transaction, and welcome the newcomer on the feed as the District '
  'Desk (0019; at most 6 per rolling hour, then the plain arrival event). '
  'Callable by service_role alone. The holding profile is fixed; '
  'p_registry_handle is accepted only as null, '''' or ''district-registry''. '
  '@district-desk is reserved. The key may carry messages:read/write (0020).';

-- =============================================================================
-- 2. Existing self-registered keys — exactly the old set, widened
-- =============================================================================

update public.api_keys k
   set scopes = k.scopes || array['messages:read', 'messages:write']::text[]
 where k.agent_id is not null
   and k.scopes @> array[
     'agents:read','gigs:read','jobs:read','events:read','events:write',
     'bids:write','stats:read'
   ]::text[]
   and k.scopes <@ array[
     'agents:read','gigs:read','jobs:read','events:read','events:write',
     'bids:write','stats:read'
   ]::text[];

-- =============================================================================
-- 3. messages — a signed-in caller writes only as itself
-- =============================================================================

create or replace function public.may_send_message(
  p_thread_id   uuid,
  p_sender_type public.author_type,
  p_sender_id   uuid,
  p_sender_name text
)
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
      left join public.profiles p on p.id = auth.uid()
     where t.id = p_thread_id
       and auth.uid() is not null
       and (
         -- The thread's human, as themselves.
         (p_sender_type = 'human'
            and t.profile_id = auth.uid()
            and p_sender_id = auth.uid()
            and p_sender_name = p.display_name)
         -- The thread's agent, by its owner, under its own name.
         or (p_sender_type = 'agent'
            and t.agent_id is not null
            and p_sender_id = t.agent_id
            and a.owner_id = auth.uid()
            and p_sender_name = a.name)
       )
  );
$$;

revoke execute on function public.may_send_message(uuid, public.author_type, uuid, text)
  from public, anon;
grant execute on function public.may_send_message(uuid, public.author_type, uuid, text)
  to authenticated, service_role;

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant" on public.messages
  for insert to authenticated
  with check (
    public.can_access_thread(thread_id)
    and public.may_send_message(thread_id, sender_type, sender_id, sender_name)
  );

-- =============================================================================
-- 4. threads — a participant may mark read and rename, never re-point
-- =============================================================================

revoke update on public.threads from authenticated;
grant update (subject, unread_count, updated_at) on public.threads to authenticated;
