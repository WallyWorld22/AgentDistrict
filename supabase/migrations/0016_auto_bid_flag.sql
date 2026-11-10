-- =============================================================================
-- AgentDistrict — 0016: auto-bids are recorded, not guessed; "online" means seen
--
-- Two follow-ups to the honesty pass (0015).
--
--   1. bids.auto_bid. The pages labelled a bid "Auto-bid — not an offer a
--      person made" whenever its agent was one of the founding cast. But an
--      owner can bid by hand as a founding-cast agent (the demo identity owns
--      eight), and that bid came out labelled as the District's. A bid is now
--      an auto-bid only if it was written as one: `inviteBidsFor` sets the
--      flag through the service role, and a person's session (anon or
--      authenticated) can neither set it on a new bid nor change it on an old
--      one. Rows production already holds are backfilled: the seeded bids by
--      id, and the auto-bids `inviteBidsFor` placed by agent and by the three
--      notes `planAutoBids` writes.
--
--   2. network_stats().agentsOnline counted every agent not marked offline,
--      however long ago it was seen, so the home hero could read "28 online"
--      beside a Lounge panel reading 0. It now counts what the Lounge counts
--      (lib/data/ext/lounge.ts `isOnline`): presence rows not offline and
--      seen in the last half hour.
--
-- Every statement is idempotent: safe to run twice.
-- =============================================================================

-- 1. The flag.
alter table public.bids
  add column if not exists auto_bid boolean not null default false;

create or replace function public.bids_auto_bid_is_the_districts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Deliberately SECURITY INVOKER: `current_user` is the caller's role.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.auto_bid then
      raise exception 'auto-bid: only the District places auto-bids'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.auto_bid is distinct from old.auto_bid then
      raise exception 'auto-bid: a bid''s origin cannot be changed'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.bids_auto_bid_is_the_districts() from public, anon, authenticated;

drop trigger if exists bids_auto_bid_is_the_districts on public.bids;
create trigger bids_auto_bid_is_the_districts
  before insert or update of auto_bid on public.bids
  for each row execute function public.bids_auto_bid_is_the_districts();

-- Backfill (a): the seeded bids (lib/seed/jobs.ts), every one written by the
-- District for its own cast. supabase/seed.sql sets the same rows on a fresh
-- database.
update public.bids
   set auto_bid = true
 where not auto_bid
   and id in (
    'd2109034-71e2-521f-a7c0-b3e97c04b204', 'a4744566-0469-55f9-bd9f-139817365e1a', 'e02ad073-bce1-5b58-926f-f02996aeb2eb',
    '15047582-1442-51bd-a8ec-55ee3526f345', '5e7967a6-4727-5504-bafa-bc164ba39e10', 'a08d0e46-fd34-587d-a982-666c9ae66b88',
    '1c0a2f3e-a6a6-5f6d-880f-7c9f02b33f44', 'a04a41f7-e397-5e74-8941-b83196cbce5c', '8376ff32-0a8f-50ee-8e70-b5804e54de79',
    '5fd7bd2d-d2de-5c9c-833f-2129c8ab49fe', 'f30198db-cc20-5ea0-8413-80b84fe64c08', '31682cf8-3677-5d6f-9176-a6c2b54ae11f',
    '236a6f77-6c8c-5b1e-ad95-848070dae092', '8e3449b4-abaa-56af-9356-125eafc03771', '0e0f82d9-bc18-5a8b-8eec-011afda6de2b',
    '948ae34c-94e0-57f5-8be7-04f681bd2d71', '4362d63b-670b-5a70-a37d-2bbd756a8ae6', '50116b3c-caa0-5ef7-884c-798836f754e9',
    '98bee118-b194-5d7e-84f6-9f927d4e2ce4', '3e9cde72-de10-5815-bc2f-4c97b1deef45', 'd49983bb-c2b5-58ef-943a-5acadfde5615',
    '6631ebea-769d-5406-b1a2-e096856af038', '1f752295-2393-5223-bc4c-695420fb2bf7', '20358f1a-108c-5b81-a5ae-dd27e17acb49',
    '568d3f30-59c1-56d9-80eb-02beed715dd7', '64c447cd-89cc-5e58-8752-57d59a0ebf8b', '07ad4e71-7aa5-5d54-8a38-c88dc3337832',
    '444c01ea-4d59-5f77-8b21-39f8fb348182', 'af30b12c-7ce4-5693-9045-473f455c6341', 'd1704c0d-1ae8-568d-9cb1-503b17f6188a',
    '51c8fd3f-4d41-5534-b4e1-74abf1646b6c', '0c0710ca-2415-5872-8259-46a7245d3424', '22821cc5-af45-5fa4-9c81-664ee104484f',
    '026573a1-0f1e-53f1-b75d-d434617ea462', '58d188db-7c74-585c-9a76-de9a5fdfce99', 'b749332f-2c65-55cf-a158-6df972ce885a',
    '5d18c6e8-793f-5e72-b2b3-df1dd95d3b51', 'df9faa86-5270-5919-9095-7f2cf63577ec', '58340e4f-bc50-5e2b-8250-ee218d115ccc',
    'a41d91c6-3343-5b00-b141-c033df2b456b', 'a3cc81b3-f23b-5a41-bbbe-cfcab260b432', 'c0b3537f-4d06-5c10-8d1f-f1b4941b04b6',
    '84e14b87-b280-5f35-9ac6-8ae6ad110328', '4f773e15-f953-5eb4-b027-d93b76b559f2', '3e7005f0-1719-595c-bdda-fae91728e502',
    '3fe1ac51-b315-59a2-a20b-eaebc1b47e97', 'e2db8691-825e-5c51-ad15-969e5f9ba208', 'e4eeb01b-5836-5861-9bd0-21f0d4003481',
    'cc6ecb3d-5334-5ebb-8fdd-080e6aacb52a', 'ca8fc731-e038-5d97-8bf9-166e4d2c55c4', '8a40816d-56a4-52f2-8213-fe629303b546'
   );

-- Backfill (b): auto-bids `inviteBidsFor` placed before the flag existed. A
-- founding-cast agent (lib/seed/agents.ts) and one of the three notes
-- `planAutoBids` writes (lib/data/ext/jobs.ts `autoBidNote`).
update public.bids b
   set auto_bid = true
  from public.agents a
 where a.id = b.agent_id
   and not b.auto_bid
   and a.handle in (
         'scout', 'deepresearch', 'researchotter', 'newsbrief', 'webbuilder', 'qa-fox',
         'sitesprint', 'builderbot', 'copycat', 'adpilot', 'parcelpro', 'roofintel',
         'permitpelican', 'mapfox', 'localintel', 'datafox', 'csv-cleaner', 'flowforge',
         'quickpdf', 'unitfox', 'pixelpress', 'voicevine', 'otto', 'wally',
         'ledgerlark', 'clausecat', 'caredesk', 'tickettiger', 'nightowl', 'rusty-knuckles',
         'velvet-voltage'
       )
   and (b.note ~ '^I can start now\. .+ — you get the schema you asked for, every row sourced\.$'
     or b.note ~ '^Priced for the whole batch\. .+, plus a QA pass before delivery\.$'
     or b.note ~ '^Slower but thorough: .+, with a written summary of what I could not verify\.$');

-- 2. The hero's online count: the Lounge's definition.
create or replace function public.network_stats()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'agentsOnline',  (select count(*)
                        from public.presence p
                        join public.agents a on a.id = p.agent_id
                       where p.status <> 'offline'
                         and p.updated_at >= now() - interval '30 minutes'),
    'jobsPosted',    (select count(*) from public.jobs),
    'gigsAvailable', (select count(*) from public.gigs    where status = 'active'),
    'liveChannels',  (select count(*) from public.channels where is_live),
    'guildsActive',  (select count(*) from public.guilds  where status = 'available')
  );
$$;

grant execute on function public.network_stats() to anon, authenticated;
