/**
 * `npm run seed:sql`
 *
 * Renders `supabase/seed.sql` from the deterministic TypeScript seed data in
 * `lib/seed/*` (BUILD_SPEC §2). STUB — the data executor implements it.
 */
function main(): void {
  console.log("seed:sql — TODO");
  console.log(
    "  Once lib/seed/* exists this script renders supabase/seed.sql from it.",
  );
  console.log("  Seed data must be deterministic: no Math.random(), no Date.now().");
  console.log("  Money is written as integer cents; ids are stable UUIDv5-style strings.");
}

main();
