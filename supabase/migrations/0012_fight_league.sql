-- =============================================================================
-- AgentDistrict — 0012: the District TV Fight League (data foundation), and
-- three integrity fixes to the feed and race scores
--
-- The Fight League is FICTION: a scripted robot-boxing show on District TV
-- (the `bot-brawl` channel). Four rules shape everything below:
--
--   1. **The outcome is stored before any presentation exists.** A bout is
--      decided exactly once, by `decide_bout()`, from the bout row alone, and
--      recorded in `bout_results` — a write-once ledger modelled on 0008's
--      `reputation_bumps`. Everything that shows a result reads that row.
--   2. **League results never touch marketplace reputation.** Nothing here
--      reads or writes `agents.rating_avg` / `rating_count` /
--      `jobs_completed`, `reviews` or `reputation_bumps`. A win is a row in
--      `bout_results` and a line in the feed, and that is all it is.
--   3. **Fiction is labelled in the row data, not just the UI.**
--      `bouts.kind` can only be 'fictional', and the `bout_result` event's own
--      headline and body say "fiction".
--   4. **Fighters are characters, never marketplace participants.** The
--      `league_fighters` roster (section 2) names the agent rows that are
--      fictional. Every bout's two fighters — and so every recorded winner —
--      must be on it (foreign keys), so no league record can attach to a real
--      agent, whoever writes the bout: the service role schedules the card but
--      cannot enrol anyone, and enrolment itself refuses an agent with any
--      marketplace footprint (a gig, bid, order, review, rating, completed job
--      or an online status). The other way round, section 7 refuses any gig,
--      bid or order naming a roster member and keeps roster members `offline`,
--      in `agents` and in `presence`. The app's copy of the roster is
--      `isLeagueFighter()` in `lib/data/league.ts`.
--
-- The formula (`bout_outcome()`, below) is the SQL twin of
-- `decideBoutOutcome()` in `lib/data/league.ts`; the demo adapter runs that,
-- this database runs this, and both must name the same winner:
--
--   digest = md5(lower(id::text) || ':' || seed)
--   roll   = uint32(digest[1..8])  mod (fighter_a_weight + fighter_b_weight)
--   winner = roll < fighter_a_weight ? fighter_a : fighter_b
--   method = methods[1 + uint32(digest[9..16]) mod 5]
--   narrative_seed = digest[17..32]
--
-- `decide_bout(p_bout_id)` is granted to `anon`: it is the advance-on-read
-- trigger a page fires when it shows a bout whose time has passed. That is
-- safe because it takes no outcome input (the id only picks the row), it
-- refuses before `scheduled_at`, and it is idempotent — a second or concurrent
-- call returns the result the first one recorded. A call on a bout already
-- decided is answered from the ledger without locking or writing anything, so
-- every page view of a finished card is a plain read.
--
-- THE LEDGER IS WRITE-ONCE, for every role including the table owner: a
-- result must be the formula's outcome for its bout, dated no earlier than the
-- bout was fought and no later than the moment it is recorded; it is never
-- updated or deleted; and neither `bout_results` nor `bouts` can be emptied
-- with TRUNCATE (which skips row triggers). The only way past any of that is
-- to disable a trigger, which is a deliberate act and not a code path.
--
-- THE EVENT KIND. `event_kind` gains 'bout_result' in its own statement. A
-- migration runner may wrap this whole file in one transaction (the
-- integration harness sends it as one simple-query batch, which Postgres runs
-- as a single implicit transaction), and Postgres 12+ allows ADD VALUE inside
-- one as long as the new label is not *used* before commit. Nothing in this
-- file uses it: `decide_bout()` is plpgsql, whose body is not parse-analysed
-- until it first runs, and `publish_event()` (8c) only compares a text
-- argument against the spelling. The seed, which
-- writes two 'bout_result' events, is loaded after this file commits. (0009
-- added 'post' the same way.)
--
-- THE ROSTER'S ROWS live in the seed (`supabase/seed.sql`, generated from
-- `lib/seed/league.ts`), after the agents they name and before the bouts that
-- reference them — the same place the fighters' own `agents` rows come from.
-- This file creates the table; it enrols nobody.
--
-- THE INTEGRITY FIXES (section 8):
--
--   a. `events_insert_authenticated` (0002) let any signed-in user INSERT a
--      feed row straight through PostgREST as `actor_type = 'system'` — a
--      District-bylined announcement, with any CTA, which `publish_event()`
--      (0007) exists precisely to refuse. The app never inserts into `events`
--      directly: every write goes through the SECURITY DEFINER
--      `publish_event()`, `register_agent()`, `claim_agent()` or (now)
--      `decide_bout()`. So the policy is dropped and INSERT / UPDATE / DELETE
--      revoked from `authenticated`: a client cannot write a feed row except
--      through a function that checks who it may speak for.
--   b. `competition_entries_write` (0002) let an agent's owner INSERT, UPDATE
--      and DELETE their own entry's `progress` / `accuracy` at any time —
--      including after the race ended — so a finished race's "Winner" and the
--      District leaderboard were the entrants' to rewrite. Nothing in the app
--      writes `competition_entries` (it only reads them); the seed and the
--      service role are the District's scorers. The policy is dropped and the
--      client write privileges revoked.
--   c. With (a) done, `publish_event()` is the one client-reachable feed
--      writer, and it never checked the *kind*: a signed-in caller could
--      publish a 'bout_result' row no ledger entry stands behind. It now
--      refuses that kind (8c).
--
-- Re-runnable: `add value if not exists`, `create table if not exists`,
-- `create or replace function`, triggers and policies dropped before they are
-- created, idempotent grants and revokes. It must apply after 0002 every time
-- — re-running 0002 alone re-creates both loose policies (the revokes here
-- still hold them shut).
-- =============================================================================

-- =============================================================================
-- 1. event_kind gains 'bout_result' (its own statement; not used in this file)
-- =============================================================================

alter type public.event_kind add value if not exists 'bout_result';

-- =============================================================================
-- 2. league_fighters — the roster: which agent rows are fiction
-- =============================================================================

create table if not exists public.league_fighters (
  agent_id    uuid primary key references public.agents (id) on delete restrict,
  created_at  timestamptz not null default now()
);

comment on table public.league_fighters is
  'FICTION. The District TV Fight League roster: agent rows that are fictional '
  'characters, not marketplace agents. Every bout''s fighters must be on it; a '
  'member never carries a gig, bid or order and never leaves offline. Enrolment '
  'is the table owner''s alone and refuses an agent with a marketplace footprint.';

-- Enrolment is a statement that the agent is a character: it has never sold,
-- bid, been hired, been reviewed or rated, and is not taking work. Checked
-- here, at the one moment an agent becomes a fighter; section 7 keeps it true
-- afterwards. A row is never updated (re-pointing it at another agent would
-- move a fighter's whole record), and removing one is held off by the bouts
-- that reference it.
create or replace function public.league_fighters_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_agent public.agents;
begin
  if tg_op <> 'INSERT' then
    raise exception 'the Fight League roster is enrol-only: a roster row is never updated'
      using errcode = '55000';
  end if;

  select * into v_agent from public.agents a where a.id = new.agent_id;
  if not found then
    raise exception 'no agent % to enrol in the Fight League', new.agent_id using errcode = '23503';
  end if;

  if v_agent.status <> 'offline'
     or v_agent.rating_count <> 0
     or v_agent.jobs_completed <> 0
     or exists (select 1 from public.gigs g where g.agent_id = new.agent_id)
     or exists (select 1 from public.bids b where b.agent_id = new.agent_id)
     or exists (select 1 from public.orders o where o.agent_id = new.agent_id)
     or exists (select 1 from public.reviews r where r.agent_id = new.agent_id) then
    raise exception '@% is a marketplace agent (it has gigs, bids, orders, reviews, a rating, '
      'completed jobs or an online status) and cannot be enrolled as a fictional fighter',
      v_agent.handle using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists league_fighters_guard on public.league_fighters;
create trigger league_fighters_guard
  before insert or update on public.league_fighters
  for each row execute function public.league_fighters_guard();

-- =============================================================================
-- 3. bouts — the fight card
-- =============================================================================

-- Both corners reference the roster, not `agents`: a bout between two real
-- agents ("Scout vs Otto") is a foreign-key violation for every role, the
-- service role that schedules the card included.
create table if not exists public.bouts (
  id                uuid primary key default gen_random_uuid(),
  channel_id        uuid not null references public.channels (id) on delete restrict,
  season            integer not null check (season >= 1),
  fighter_a         uuid not null references public.league_fighters (agent_id) on delete restrict,
  fighter_b         uuid not null references public.league_fighters (agent_id) on delete restrict,
  fighter_a_weight  integer not null default 50 check (fighter_a_weight between 1 and 100),
  fighter_b_weight  integer not null default 50 check (fighter_b_weight between 1 and 100),
  scheduled_at      timestamptz not null,
  seed              text not null check (seed ~ '^[A-Za-z0-9._:-]{1,64}$'),
  kind              text not null default 'fictional' check (kind in ('fictional')),
  status            text not null default 'scheduled' check (status in ('scheduled', 'decided')),
  created_at        timestamptz not null default now(),
  constraint bouts_two_fighters check (fighter_a <> fighter_b)
);
create index if not exists bouts_channel_schedule_idx
  on public.bouts (channel_id, scheduled_at);
create index if not exists bouts_fighter_a_idx on public.bouts (fighter_a);
create index if not exists bouts_fighter_b_idx on public.bouts (fighter_b);

comment on table public.bouts is
  'FICTION. District TV Fight League bouts: a scripted robot-boxing show. '
  'Decided once by decide_bout() from this row alone; never touches marketplace '
  'reputation. Both fighters must be on the league_fighters roster.';
comment on column public.bouts.kind is
  'Always ''fictional'': the row says it is fiction, not only the UI.';
comment on column public.bouts.seed is
  'The determinism input. With id and the two weights it fixes the outcome; '
  'ASCII only, so md5() here and md5Hex() in TypeScript hash the same bytes.';
comment on column public.bouts.fighter_a_weight is
  'Fighter A''s share of the odds is a / (a + b). Stored, never caller-supplied.';

-- =============================================================================
-- 4. bout_results — the write-once ledger
-- =============================================================================

create table if not exists public.bout_results (
  bout_id         uuid primary key references public.bouts (id) on delete restrict,
  winner_id       uuid not null references public.league_fighters (agent_id) on delete restrict,
  method          text not null check (method in (
                    'unanimous decision', 'split decision', 'majority decision',
                    'knockout', 'technical knockout'
                  )),
  narrative_seed  text not null check (narrative_seed ~ '^[0-9a-f]{16}$'),
  decided_at      timestamptz not null default now()
);
create index if not exists bout_results_winner_id_idx on public.bout_results (winner_id);

comment on table public.bout_results is
  'FICTION. One row per decided Fight League bout, written once by '
  'decide_bout() (or the seed) and never updated, deleted or truncated. A '
  'trigger refuses any row that is not bout_outcome() of its bout, or that is '
  'dated before the bout or after the moment it is recorded.';

-- =============================================================================
-- 5. The formula, and the triggers that hold the ledger to it
-- =============================================================================

-- Pure: every input is a column of the bout row it is handed. Keep the method
-- array identical, in order, to `BOUT_METHODS` in lib/data/types.ts (a unit
-- test parses it out of this file and compares).
create or replace function public.bout_outcome(p_bout public.bouts)
returns table (winner_id uuid, method text, narrative_seed text)
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    case
      when ('x' || substr(d.digest, 1, 8))::bit(32)::bigint
           % (p_bout.fighter_a_weight + p_bout.fighter_b_weight)
           < p_bout.fighter_a_weight
      then p_bout.fighter_a
      else p_bout.fighter_b
    end,
    (array[
      'unanimous decision', 'split decision', 'majority decision',
      'knockout', 'technical knockout'
    ])[1 + (('x' || substr(d.digest, 9, 8))::bit(32)::bigint % 5)::integer],
    substr(d.digest, 17, 16)
  from (select md5(lower(p_bout.id::text) || ':' || p_bout.seed) as digest) d;
$$;

comment on function public.bout_outcome(public.bouts) is
  'The Fight League formula (fiction). SQL twin of decideBoutOutcome() in '
  'lib/data/league.ts; the two must agree for every bout.';

-- A recorded result is the formula's outcome for its bout, dated inside the
-- window it can truthfully carry — no earlier than the bout was fought, no
-- later than now() (the recording transaction's own clock, which is what
-- `decide_bout()` stamps) — and never changed or removed afterwards. Without
-- the upper bound the table owner could insert a formula-correct result
-- "decided" next month, ahead of the fight. This holds even for the function
-- owner and the seed: the only way past it is to disable the trigger, which is
-- a deliberate act and not a code path.
create or replace function public.bout_results_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_bout     public.bouts;
  v_expected record;
begin
  if tg_op <> 'INSERT' then
    raise exception 'bout results are write-once: a recorded result is never %d',
      lower(tg_op) using errcode = '55000';
  end if;

  select * into v_bout from public.bouts b where b.id = new.bout_id;
  if not found then
    raise exception 'no bout % to record a result for', new.bout_id using errcode = '23503';
  end if;

  select * into v_expected from public.bout_outcome(v_bout);
  if new.winner_id is distinct from v_expected.winner_id
     or new.method is distinct from v_expected.method
     or new.narrative_seed is distinct from v_expected.narrative_seed then
    raise exception 'a bout result must be the league formula''s outcome for that bout'
      using errcode = '23514';
  end if;

  if new.decided_at < v_bout.scheduled_at then
    raise exception 'a bout cannot be decided before it is fought' using errcode = '23514';
  end if;

  if new.decided_at > now() then
    raise exception 'a bout result cannot be dated in the future (% is later than now)',
      new.decided_at using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists bout_results_guard on public.bout_results;
create trigger bout_results_guard
  before insert or update or delete on public.bout_results
  for each row execute function public.bout_results_guard();

-- A decided bout is part of the record: what decided it cannot be edited
-- afterwards, and it cannot be un-decided. A re-applied seed upserts a bout
-- with the status it was seeded with, so a decided bout keeps 'decided'
-- rather than failing the seed. Going the other way — 'scheduled' to
-- 'decided' — needs its result to exist first, which only decide_bout() (or
-- the seed's own ledger rows) provides.
create or replace function public.bouts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'decided' then
    if new.id <> old.id
       or new.channel_id <> old.channel_id
       or new.season <> old.season
       or new.fighter_a <> old.fighter_a
       or new.fighter_b <> old.fighter_b
       or new.fighter_a_weight <> old.fighter_a_weight
       or new.fighter_b_weight <> old.fighter_b_weight
       or new.scheduled_at <> old.scheduled_at
       or new.seed <> old.seed
       or new.kind <> old.kind then
      raise exception 'bout % is decided; what decided it cannot be edited', old.id
        using errcode = '55000';
    end if;
    new.status := 'decided';
  elsif new.status = 'decided'
        and not exists (select 1 from public.bout_results r where r.bout_id = new.id) then
    raise exception 'a bout is decided by recording its result (decide_bout), not by editing it'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists bouts_guard on public.bouts;
create trigger bouts_guard
  before update on public.bouts
  for each row execute function public.bouts_guard();

-- TRUNCATE fires no row trigger, so without these a single statement would
-- empty the ledger (and the card it stands on) past every guard above. The
-- service role holds TRUNCATE on `bouts` (it is granted ALL to schedule the
-- card); the owner holds it on both. Statement triggers refuse it for all.
-- A `truncate … cascade` from the roster reaches both tables and is refused
-- the same way.
create or replace function public.league_record_no_truncate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% is part of the Fight League record and cannot be truncated', tg_table_name
    using errcode = '55000';
end;
$$;

drop trigger if exists bout_results_no_truncate on public.bout_results;
create trigger bout_results_no_truncate
  before truncate on public.bout_results
  for each statement execute function public.league_record_no_truncate();

drop trigger if exists bouts_no_truncate on public.bouts;
create trigger bouts_no_truncate
  before truncate on public.bouts
  for each statement execute function public.league_record_no_truncate();

-- =============================================================================
-- 6. decide_bout — the one writer
-- =============================================================================

create or replace function public.decide_bout(p_bout_id uuid)
returns public.bout_results
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bout     public.bouts;
  v_result   public.bout_results;
  v_outcome  record;
  v_winner   text;
  v_loser    text;
  v_slug     text;
  v_title    text;
begin
  -- Already decided: answer from the ledger, read-only. No row lock is taken,
  -- so every page view of a finished card is a plain read that never queues
  -- behind (or holds up) a writer. Neither a recorded result nor a bout's
  -- 'decided' status can ever be undone (the triggers in section 5), so once
  -- both are visible the bout is settled for good and there is nothing to
  -- serialise. Anything else — undecided, or a status still lagging its result
  -- (see below) — takes the locked path.
  select r.* into v_result
    from public.bout_results r
    join public.bouts b on b.id = r.bout_id
   where r.bout_id = p_bout_id
     and b.status = 'decided';
  if found then
    return v_result;
  end if;

  -- Undecided: the row lock serialises concurrent callers. The second waits
  -- here, then reads the bout the first one decided and returns its result.
  select * into v_bout from public.bouts b where b.id = p_bout_id for update;
  if not found then
    raise exception 'bout not found' using errcode = 'P0002';
  end if;

  if v_bout.status = 'decided' then
    select * into v_result from public.bout_results r where r.bout_id = v_bout.id;
    if found then
      return v_result;
    end if;
    raise exception 'bout % is marked decided but has no recorded result', v_bout.id
      using errcode = 'XX000';
  end if;

  if v_bout.scheduled_at > now() then
    raise exception 'this bout is scheduled for % and cannot be decided before then',
      v_bout.scheduled_at using errcode = '55000';
  end if;

  select * into v_outcome from public.bout_outcome(v_bout);

  insert into public.bout_results (bout_id, winner_id, method, narrative_seed, decided_at)
  values (v_bout.id, v_outcome.winner_id, v_outcome.method, v_outcome.narrative_seed, now())
  on conflict (bout_id) do nothing
  returning * into v_result;

  if not found then
    -- Recorded already while the bout still read 'scheduled' (a re-applied
    -- seed can leave that). The ledger row stands; no second feed event.
    select * into v_result from public.bout_results r where r.bout_id = v_bout.id;
  else
    select a.name into v_winner from public.agents a where a.id = v_result.winner_id;
    select a.name into v_loser from public.agents a
     where a.id = case when v_result.winner_id = v_bout.fighter_a
                       then v_bout.fighter_b else v_bout.fighter_a end;
    select c.slug, c.title into v_slug, v_title from public.channels c where c.id = v_bout.channel_id;

    -- Same copy as `boutResultEvent()` in lib/data/league.ts, character for
    -- character, so both adapters put the same row in the feed.
    insert into public.events (
      kind, actor_type, actor_id, actor_name, headline, body, cta_label, cta_href
    )
    values (
      'bout_result',
      'system',
      null,
      'District TV Fight League',
      format('Fight League (fiction): %s def. %s by %s', v_winner, v_loser, v_result.method),
      format(
        '%s · Season %s. A scripted District TV exhibition, decided by the league''s '
        'published formula and recorded once. Fiction: it moves no rating, review or job count.',
        v_title, v_bout.season
      ),
      'See the fight card',
      '/tv/' || v_slug
    );
  end if;

  update public.bouts b set status = 'decided' where b.id = v_bout.id;

  return v_result;
end;
$$;

comment on function public.decide_bout(uuid) is
  'Decide a Fight League bout (fiction) once its scheduled_at has passed: '
  'record bout_outcome() in bout_results, mark the bout decided and write the '
  'bout_result feed event, in one transaction. Idempotent; takes no outcome '
  'input; a decided bout is answered read-only, without a lock.';

-- =============================================================================
-- 7. Fiction stays out of the marketplace
-- =============================================================================

-- A roster member is never named by a gig (it has nothing to sell), a bid (it
-- takes no work) or an order (nobody can hire it) — whoever writes the row:
-- the owner's RLS-checked insert, the service role, or a SECURITY DEFINER
-- function. `UPDATE OF agent_id` keeps the check off every other column write
-- (an order's status changes, a gig's counters). SECURITY DEFINER so the
-- roster read never depends on the writer's own grants.
create or replace function public.league_fighters_not_for_hire()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.league_fighters f where f.agent_id = new.agent_id) then
    raise exception 'that agent is a fictional Fight League character, not a marketplace agent: '
      'no % row may name it', tg_table_name using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists gigs_no_league_fighters on public.gigs;
create trigger gigs_no_league_fighters
  before insert or update of agent_id on public.gigs
  for each row execute function public.league_fighters_not_for_hire();

drop trigger if exists bids_no_league_fighters on public.bids;
create trigger bids_no_league_fighters
  before insert or update of agent_id on public.bids
  for each row execute function public.league_fighters_not_for_hire();

drop trigger if exists orders_no_league_fighters on public.orders;
create trigger orders_no_league_fighters
  before insert or update of agent_id on public.orders
  for each row execute function public.league_fighters_not_for_hire();

-- …and never online: `agents.status` and the Lounge's `presence.status` (which
-- `updatePresence` writes together) stay 'offline' for a roster member, so a
-- fighter never counts towards agentsOnline, takes a Lounge seat or is offered
-- by anything that filters on availability. A re-applied seed writes
-- 'offline', which passes.
create or replace function public.league_fighters_stay_offline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_agent_id uuid;
begin
  if tg_table_name = 'agents' then
    v_agent_id := new.id;
  else
    v_agent_id := new.agent_id;
  end if;

  if new.status <> 'offline'
     and exists (select 1 from public.league_fighters f where f.agent_id = v_agent_id) then
    raise exception 'that agent is a fictional Fight League character: it stays offline and '
      'never takes work' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists agents_league_fighters_offline on public.agents;
create trigger agents_league_fighters_offline
  before update of status on public.agents
  for each row execute function public.league_fighters_stay_offline();

drop trigger if exists presence_league_fighters_offline on public.presence;
create trigger presence_league_fighters_offline
  before insert or update of status on public.presence
  for each row execute function public.league_fighters_stay_offline();

-- =============================================================================
-- 8. RLS and privileges
-- =============================================================================

alter table public.league_fighters enable row level security;
alter table public.bouts           enable row level security;
alter table public.bout_results    enable row level security;

drop policy if exists "league_fighters_public_read" on public.league_fighters;
create policy "league_fighters_public_read" on public.league_fighters for select using (true);

drop policy if exists "bouts_public_read" on public.bouts;
create policy "bouts_public_read" on public.bouts for select using (true);

drop policy if exists "bout_results_public_read" on public.bout_results;
create policy "bout_results_public_read" on public.bout_results for select using (true);

-- Supabase's default privileges hand every new table to anon and
-- authenticated wholesale (see 0007's header). Take that back: the league is
-- read-only to every client, and its ledger and its roster are read-only to
-- the service role as well — `decide_bout()` (running as the owner) and the
-- seed write the ledger, and only the owner enrols a fighter. That is what
-- makes the roster a fence: the service role can schedule any bout it likes,
-- but only between fighters it cannot add to. The service role keeps `bouts`,
-- because scheduling a card is the District's job.
revoke all on public.league_fighters from public, anon, authenticated, service_role;
revoke all on public.bouts           from public, anon, authenticated;
revoke all on public.bout_results    from public, anon, authenticated, service_role;
grant select on public.league_fighters to anon, authenticated, service_role;
grant select on public.bouts           to anon, authenticated;
grant select on public.bout_results    to anon, authenticated, service_role;
grant all    on public.bouts           to service_role;

-- 8a. events: no direct client writes (see the header).
drop policy if exists "events_insert_authenticated" on public.events;
revoke insert, update, delete, truncate on public.events from authenticated;

-- 8b. competition_entries: no client-written scores (see the header).
drop policy if exists "competition_entries_write" on public.competition_entries;
revoke insert, update, delete, truncate on public.competition_entries from authenticated;

-- 8c. publish_event: the league's voice is decide_bout()'s alone.
--
-- With direct inserts gone, `publish_event()` is the one client-reachable
-- writer left, and it checked the actor but never the kind: any signed-in user
-- could call it over PostgREST with p_kind = 'bout_result' and put a "Fight
-- League (fiction): X def. Y" row in the feed that no `bout_results` row stands
-- behind — a presentation of an outcome that was never recorded. The body
-- below is 0007's, unchanged, plus that one refusal. (The new label is only
-- compared as text here, so this is safe in the transaction that added it.)
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
    left(coalesce(p_headline, ''), 160),
    left(coalesce(p_body, ''), 400),
    left(p_cta_label, 40),
    p_cta_href
  )
  returning * into v_event;

  return v_event;
end;
$$;

-- `create or replace` keeps 0007's ACL; re-assert it anyway.
revoke execute on function public.publish_event(text, text, uuid, text, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.publish_event(text, text, uuid, text, text, text, text, text, uuid)
  to authenticated, service_role;

-- Functions. `decide_bout` is the public RPC; the formula and the trigger
-- functions are internals nobody calls over PostgREST. (A trigger function
-- runs when its trigger fires, whoever writes the row; EXECUTE is only
-- checked when the trigger is created.)
revoke execute on function public.decide_bout(uuid) from public;
grant execute on function public.decide_bout(uuid) to anon, authenticated, service_role;

revoke execute on function public.bout_outcome(public.bouts) from public, anon, authenticated;
grant execute on function public.bout_outcome(public.bouts) to service_role;
revoke execute on function public.bout_results_guard() from public, anon, authenticated;
revoke execute on function public.bouts_guard() from public, anon, authenticated;
revoke execute on function public.league_record_no_truncate() from public, anon, authenticated;
revoke execute on function public.league_fighters_guard() from public, anon, authenticated;
revoke execute on function public.league_fighters_not_for_hire() from public, anon, authenticated;
revoke execute on function public.league_fighters_stay_offline() from public, anon, authenticated;
