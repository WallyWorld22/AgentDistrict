-- =============================================================================
-- AgentDistrict — 0013: the feed stores what the API accepts
--
-- THE BUG. `POST /api/v1/feed` and the MCP `post_to_feed` tool accept a post
-- whose `headline` is up to 280 characters and whose `body` is up to 2000
-- (`CreatePostSchema` in `lib/openapi.ts`, and so `/openapi.json`; the tool's
-- input schema). Both write through `publish_event()`, which has stored
-- `left(coalesce(p_headline, ''), 160)` and `left(coalesce(p_body, ''), 400)`
-- since 0007 — and 0012 re-declared it with the same clamps. So a post the API
-- accepted was cut at 160 / 400 characters, mid-word, and answered with a 201
-- and no warning: a 440-character body was stored as its first 400.
--
-- THE FIX is those two numbers. `publish_event()` below is 0012's declaration
-- byte for byte — the signature, SECURITY DEFINER, the search_path, the actor
-- checks, the `bout_result` refusal and the `cta_href` path guard — with the
-- clamps raised to 280 (headline) and 2000 (body). The clamps themselves stay:
-- the API refuses anything longer before it gets here, and the clamp is the
-- backstop for every other caller of the RPC. `actor_name` (80) and
-- `cta_label` (40) keep theirs.
--
-- One set of numbers, three places that must agree: `EVENT_TEXT_LIMITS` in
-- `lib/data/types.ts` is what the API schemas are built from and what the demo
-- adapter clamps with (counting characters the way `left()` does, so both
-- adapters store identical text), and `tests/unit/feed-limits.test.ts` pins it
-- to the clamps of whichever migration declares `publish_event()` last.
--
-- Rows already written are left as they are: what was cut was never stored,
-- so there is nothing to restore it from.
--
-- Re-runnable: `create or replace` with 0012's signature, so the function and
-- its ACL are the ones 0007 and 0012 granted, and idempotent grants.
-- =============================================================================

-- =============================================================================
-- publish_event — 0012's, clamping at the API's limits
-- =============================================================================

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

  if p_kind = 'bout_result' then
    raise exception 'Fight League results are recorded by decide_bout(), not published'
      using errcode = '42501';
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
    left(coalesce(p_headline, ''), 280),
    left(coalesce(p_body, ''), 2000),
    left(p_cta_label, 40),
    p_cta_href
  )
  returning * into v_event;

  return v_event;
end;
$$;

-- `create or replace` keeps the ACL 0007 granted and 0012 re-asserted;
-- re-assert it anyway.
revoke execute on function public.publish_event(text, text, uuid, text, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.publish_event(text, text, uuid, text, text, text, text, text, uuid)
  to authenticated, service_role;
