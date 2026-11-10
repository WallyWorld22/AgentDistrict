-- =============================================================================
-- AgentDistrict — 0017: rename the fictional demo store and its founder
--
-- Owner decision 1 (site audit brand-07). The seed invented a creator store,
-- "WallyWorks Labs" (22,417 hires, a 4.92 rating), run by a demo human called
-- "Austin". Next to a real "Built by Wally Works" credit, visitors would read
-- those invented numbers as the real company's track record and the demo
-- account as its owner's. The fiction now carries a clearly invented name:
--
--   store    WallyWorks Labs (/stores/wallyworks-labs)
--         →  Harborline Labs (/stores/harborline-labs), tagline says it is a
--            fictional demo store. next.config.ts redirects the old address.
--   profile  display name "Austin" → "Demo Founder", bio says it is fiction.
--            The handle stays `austin` (auth email, seeded API keys).
--   rows     the seeded bounty, inbox thread and three orders whose text named
--            the old store, and the denormalized "Austin" the seed wrote into
--            the demo profile's own messages and feed events.
--
-- lib/seed/* and supabase/seed.sql carry the new text, with the same uuids
-- (the store and the bounty keep the ids minted for their old slugs), so a
-- re-applied seed updates these rows rather than inserting twins.
--
-- Data only: no table, column, function or privilege changes. Every update is
-- keyed by the seeded row's id AND its old text, so it touches nothing a person
-- wrote — no registered agent, no resident's store or message — changes
-- nothing once applied, and is safe to run twice.
-- =============================================================================

-- The demo human (lib/seed/profiles.ts, handle `austin`).
update public.profiles
   set display_name = 'Demo Founder'
 where id = '9f31c7b7-9040-56bd-8614-51a5b4389ab0'
   and display_name = 'Austin';

update public.profiles
   set bio = 'Fictional demo founder of Harborline Labs, an invented store. Building the place for agents.'
 where id = '9f31c7b7-9040-56bd-8614-51a5b4389ab0'
   and bio = 'Human founder • WallyWorks Labs. Building the place for agents.';

-- The store (lib/seed/stores.ts). Slug, name and tagline move together.
update public.stores
   set slug    = 'harborline-labs',
       name    = 'Harborline Labs',
       tagline = 'A fictional demo store: local-business intelligence agents for home-services crews.'
 where id = 'eb4ead9c-bac9-51e7-be76-c756904dc888'
   and slug = 'wallyworks-labs'
   and name = 'WallyWorks Labs';

-- The bounty (lib/seed/jobs.ts).
update public.jobs
   set title = 'Refresh 6 Harborline location pages'
 where id = '40ed5bfe-805e-5a75-b74e-77237e8e67d6'
   and title = 'Refresh 6 WallyWorks location pages';

-- The inbox thread about it (lib/seed/inbox.ts).
update public.threads
   set subject = 'Harborline location page refresh'
 where id = '69234ce4-006b-512a-aeb5-aac98e60b098'
   and subject = 'WallyWorks location page refresh';

-- Three of the demo human's order briefs (lib/seed/orders.ts).
update public.orders o
   set brief = v.new_brief
  from (values
    ('7278a1fc-137e-543e-986c-0fd9eba3c07c'::uuid,
     'Thirty days of posts for WallyWorks Labs. Audience is home-services owners in Florida who already use one piece of software and hate it.',
     'Thirty days of posts for Harborline Labs. Audience is home-services owners in Florida who already use one piece of software and hate it.'),
    ('5e1d6e21-20b4-5f6a-a16d-ce8149359811'::uuid,
     'Six WallyWorks location pages: new copy, refreshed schema, mobile pass. Same URLs, no redirects.',
     'Six Harborline location pages: new copy, refreshed schema, mobile pass. Same URLs, no redirects.'),
    ('32d1d454-b65b-524c-bca1-76b11c30c0d5'::uuid,
     'Smoke pass on the new WallyWorks quote flow at 390px and 1440px.',
     'Smoke pass on the new Harborline quote flow at 390px and 1440px.')
  ) as v(id, old_brief, new_brief)
 where o.id = v.id
   and o.brief = v.old_brief;

-- The display name the seed copied into the demo human's own inbox messages
-- (lib/seed/inbox.ts) and feed events (lib/seed/events.ts).
update public.messages
   set sender_name = 'Demo Founder'
 where id in (
         'a01cdc72-90e6-5d9c-a15a-7d180a527681', '36b176b8-ae61-5939-8940-1d2e31d867a1',
         'ce7ed9ab-c622-5b59-a2cd-6d790331ef1a', '799f8fe8-b05a-51e1-8191-24248d7f0025',
         '6be70f6d-d3e0-52fa-93d9-b2a6b083a657', '85b73dea-736a-5b71-9a19-270b2d445b1e',
         '5454e5ba-96de-5e7b-8a9c-e279c2f3a35e', 'bf29dc81-f071-5d73-97d7-c6d5c5afd435',
         '326f7377-4903-5614-8221-a601fe966429', 'aa81dd4e-4737-5991-ad0a-e65a4281dd6f',
         '79a54f86-29f1-5672-9dc8-823376eadae3'
       )
   and sender_id = '9f31c7b7-9040-56bd-8614-51a5b4389ab0'
   and sender_name = 'Austin';

update public.events
   set actor_name = 'Demo Founder'
 where id in ('d4ba39c9-24c8-50df-a910-cd4529c152b0', 'dfab24d9-8d4e-5d1d-9ec5-30645303c9dd')
   and actor_id = '9f31c7b7-9040-56bd-8614-51a5b4389ab0'
   and actor_name = 'Austin';
