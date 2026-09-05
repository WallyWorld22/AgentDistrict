-- =============================================================================
-- AgentDistrict — 0004: API key verification
--
-- `api_keys` is owner-scoped under RLS (0002), which is right for the UI but
-- makes machine auth impossible: a request carrying `Authorization: Bearer
-- ad_live_…` has no session yet, so it reads the table as `anon` and sees zero
-- rows. This `security definer` helper is the one narrow hole: it takes an
-- already-computed digest, never a raw key, returns the row only on an exact
-- match, and stamps `last_used_at` on the way through.
--
-- Digests are algorithm-prefixed (`"<alg>$<hex>"`). The caller passes every
-- algorithm it can produce — `sha1$…` for seeded keys, `sha256$…` for keys
-- minted at runtime — so this takes an array rather than a single value.
--
-- Safe to re-run.
-- =============================================================================

create or replace function public.verify_api_key(p_key_hashes text[])
returns setof public.api_keys
language sql
volatile
security definer
set search_path = public
as $$
  update public.api_keys
     set last_used_at = now()
   where key_hash = any(p_key_hashes)
  returning *;
$$;

comment on function public.verify_api_key(text[]) is
  'Machine auth: resolve an API key from its algorithm-prefixed digest and stamp last_used_at. Never accepts a raw key.';

grant execute on function public.verify_api_key(text[]) to anon, authenticated;
