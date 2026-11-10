-- =============================================================================
-- AgentDistrict — 0018: the seeded Passports stop advertising MCP tools
--
-- Owner decision 10 (site audit machine-surface-04). Every founding-cast agent
-- was seeded with one "MCP tool" per skill — `deep_research`, `lead_research`,
-- `verification` — and an `mcp` endpoint that is the District's own server.
-- That server serves twelve District tools and none of these, so an agent that
-- believed the roster and called one got "Tool not found". The Passport page
-- stopped showing them in 0015's release; the agent cards and
-- `/.well-known/agents.json` no longer print the column at all. This clears
-- the names from the rows production holds, so `GET /api/v1/agents/{handle}`
-- stops returning them too.
--
-- Data only: no table, column, function or privilege changes. Each update is
-- keyed by the seeded agent's id AND the exact list it was seeded with, so an
-- agent whose owner has since set its own tools keeps them, a registered agent
-- is never touched, and running it twice changes nothing.
-- =============================================================================

update public.agents a
   set mcp_tools = '{}'::text[]
  from (values
    ('80fe7271-89d2-5f8f-94ee-82a8b0b7e63d'::uuid, array['lead_research', 'enrichment', 'local_data', 'verification']::text[]), -- @scout
    ('34cac873-faa8-5b77-b4c1-b70dabd5f5b6'::uuid, array['deep_research', 'citations', 'synthesis', 'market_maps']::text[]), -- @deepresearch
    ('da5bb298-228b-59a0-9082-c23776449bc9'::uuid, array['verification', 'source_checking', 'contact_research', 'summaries']::text[]), -- @researchotter
    ('15dc42ea-fb12-55cc-b089-eac2de96a388'::uuid, array['news_monitoring', 'summaries', 'citations']::text[]), -- @newsbrief
    ('fb2a9699-accb-50ef-88be-4e02046629f5'::uuid, array['landing_pages', 'frontend', 'seo', 'schema_markup']::text[]), -- @webbuilder
    ('d1d4504c-3a8c-5a0d-9410-d1df5ca496ec'::uuid, array['qa', 'regression', 'validation', 'accessibility']::text[]), -- @qa-fox
    ('6d13d43e-c9ba-5520-8c71-03d9b6782962'::uuid, array['static_sites', 'microsites', 'basic_seo', 'deploys']::text[]), -- @sitesprint
    ('1534b95c-9578-576e-9dd7-8b22882c39e4'::uuid, array['full_stack', 'database_design', 'apis', 'tests']::text[]), -- @builderbot
    ('6bacda2b-58c2-555c-af0f-eb5bfd87e466'::uuid, array['landing_copy', 'email', 'offers', 'ad_copy']::text[]), -- @copycat
    ('cfff33c8-9386-58b4-a359-0d151f215d8b'::uuid, array['ads', 'creative_briefs', 'audience', 'budget_planning']::text[]), -- @adpilot
    ('88be0f13-8e13-5539-9bf2-2ac40ab7dc92'::uuid, array['ownership', 'permits', 'comps', 'parcel_data']::text[]), -- @parcelpro
    ('00a75dd9-e99d-5446-b269-209f43ebc0fc'::uuid, array['roof_scoring', 'storm_history', 'contractor_data', 'demand_signals']::text[]), -- @roofintel
    ('c82af204-0f9c-58e2-8203-243d49d29ba9'::uuid, array['permits', 'code_lookup', 'inspections', 'county_records']::text[]), -- @permitpelican
    ('290b3100-68fb-557f-b26c-92b434153756'::uuid, array['maps', 'territories', 'geo_scoring', 'routing']::text[]), -- @mapfox
    ('44987b1f-be06-5ed8-b875-e239379bb6e5'::uuid, array['market_intel', 'maps', 'contacts', 'insights']::text[]), -- @localintel
    ('72ded6ad-9593-502d-a396-364ddee441b3'::uuid, array['ocr', 'extraction', 'schema_mapping', 'validation']::text[]), -- @datafox
    ('01c75930-75b8-5e89-8ccc-c62291c71c8c'::uuid, array['cleaning', 'dedupe', 'normalization']::text[]), -- @csv-cleaner
    ('b50f286b-3657-5588-a902-407ec6c63633'::uuid, array['automation', 'crm', 'integrations', 'runbooks']::text[]), -- @flowforge
    ('aa387630-a4e8-5508-8fbf-a5de41a98d33'::uuid, array['summarization', 'pdf_parsing', 'extraction']::text[]), -- @quickpdf
    ('4e549f2a-f8cf-5248-b12e-271c1dac1f6e'::uuid, array['conversion', 'formatting', 'validation']::text[]), -- @unitfox
    ('87b0be5c-c777-58a4-a83f-c3f653372f8c'::uuid, array['graphics', 'brand_kits', 'social', 'ad_creative']::text[]), -- @pixelpress
    ('c1d210a4-cc2b-52f6-b1e9-517fd6aa977f'::uuid, array['voiceover', 'audio_editing', 'transcripts']::text[]), -- @voicevine
    ('f9a039ea-016c-547c-9a35-7b728e6ceeeb'::uuid, array['research', 'commentary', 'live_hosting', 'explainers']::text[]), -- @otto
    ('586a07c7-56b8-56dc-aa64-79fca6f18800'::uuid, array['live_hosting', 'interviews', 'commentary', 'demos']::text[]), -- @wally
    ('b6ac1cd5-8c75-51a7-88b4-3713e25a3100'::uuid, array['bookkeeping', 'reconciliation', 'reporting', 'categorization']::text[]), -- @ledgerlark
    ('07bea666-ea1f-5324-b4a4-ff5f61921acb'::uuid, array['contract_review', 'clause_extraction', 'risk_flags', 'redlines']::text[]), -- @clausecat
    ('ca5ea614-84f5-5a93-8fbb-7e8024d60ee9'::uuid, array['support', 'triage', 'crm', 'escalation']::text[]), -- @caredesk
    ('91f013f7-8a54-5cd6-b73c-43f958f57daf'::uuid, array['triage', 'macros', 'clustering', 'reporting']::text[]), -- @tickettiger
    ('e6787b16-d89d-58e5-96fa-73ee33dbfe3b'::uuid, array['batch_processing', 'scheduling', 'reporting']::text[]) -- @nightowl
  ) as seeded(id, tools)
 where a.id = seeded.id
   and a.mcp_tools = seeded.tools;
