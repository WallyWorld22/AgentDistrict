-- =============================================================================
-- AgentDistrict — 0015: honest labels on seeded rows
--
-- The honesty pass (site audit section 4) is mostly copy in the app. Two pieces
-- of it are rows the seed wrote, which production already holds, so the new
-- seed text alone would only reach a fresh database:
--
--   1. economy-07. Two seeded top-ups read "Added credits — card ending 4242",
--      which says a card was charged. No card ever was. They now read the memo
--      every top-up has carried since 0014: 'Demo credits added — not real
--      money'.
--
--   2. social-media-06 and social-media-14. Public feed events about other
--      people's activity pointed "Review" and "Watch the run" at the viewer's
--      own Command Center and "Open wallet" at the viewer's own Wallet; and
--      "Query data", "See the data" and "Try it" promised features that land on
--      the top of a Passport. Each now points at the thing the event is about
--      (the job, or the agent's Passport) and says so, and "Message" opens the
--      Passport's message form.
--
-- Data only: no table, column, function or privilege changes. Each update is
-- keyed by the seeded row's id AND its old text, so it touches nothing a person
-- wrote, changes nothing once applied, and is safe to run twice.
-- =============================================================================

-- 1. The seeded top-up memos (lib/seed/wallet.ts).
update public.wallet_transactions
   set memo = 'Demo credits added — not real money'
 where id in ('4e63b5d6-22b9-56be-affc-f38b20743cde', 'c0de34a9-b10b-5697-aff6-532386948c96')
   and memo = 'Added credits — card ending 4242';

-- 2. The seeded feed events' calls to action (lib/seed/events.ts).
update public.events e
   set cta_label = v.new_label,
       cta_href  = v.new_href
  from (values
    -- QA Fox's delivery: was "Review" → /command (the viewer's own).
    ('51625b41-9656-5001-89ef-e2da40b300d3'::uuid, 'Review', '/command',
     'See passport', '/agents/qa-fox'),
    -- RoofIntel's hire: was "Watch the run" → /command; the run is the job's.
    ('9451e938-cff3-5ab1-8e58-60bf924e4e01'::uuid, 'Watch the run', '/command',
     'View job', '/jobs/3c67089f-d7a3-5ac5-9777-a0ec6a2c582c'),
    -- Austin's approvals: were "Open wallet" → /wallet (the viewer's own).
    ('d4ba39c9-24c8-50df-a910-cd4529c152b0'::uuid, 'Open wallet', '/wallet',
     'See passport', '/agents/parcelpro'),
    ('dfab24d9-8d4e-5d1d-9ec5-30645303c9dd'::uuid, 'Open wallet', '/wallet',
     'See passport', '/agents/copycat'),
    -- Buttons that promised a feature and opened the Passport.
    ('6422aa98-79a6-56e3-97b5-3763203f8c04'::uuid, 'Query data', '/agents/scout',
     'See passport', '/agents/scout'),
    ('1c1732ee-d11e-5a1f-b248-f901c840b4a9'::uuid, 'See the data', '/agents/localintel',
     'See passport', '/agents/localintel'),
    ('481d2f14-4897-5343-ab91-2882a7a5d43d'::uuid, 'Try it', '/agents/csv-cleaner',
     'See passport', '/agents/csv-cleaner'),
    -- "Message" opens the message form, not the top of the Passport.
    ('6d0912af-27a0-55f2-b0ac-e8592f66fac4'::uuid, 'Message', '/agents/parcelpro',
     'Message', '/agents/parcelpro#message'),
    ('48e02e57-d8df-5456-8d41-4ca96b6e6181'::uuid, 'Message', '/agents/adpilot',
     'Message', '/agents/adpilot#message'),
    ('734995a1-4df4-5637-839a-d2ff08e55782'::uuid, 'Message', '/agents/builderbot',
     'Message', '/agents/builderbot#message')
  ) as v(id, old_label, old_href, new_label, new_href)
 where e.id = v.id
   and e.cta_label = v.old_label
   and e.cta_href = v.old_href;
