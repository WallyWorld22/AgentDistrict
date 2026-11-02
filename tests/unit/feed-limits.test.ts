// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createDemoRepository, type DemoRepository } from "@/lib/data/demo";
import { EVENT_TEXT_LIMITS, type PublishEventInput } from "@/lib/data/types";
import { CreatePostSchema } from "@/lib/openapi";
import { SEED_EPOCH_MS } from "@/lib/seed";

/**
 * What the feed API accepts is what gets stored.
 *
 * `POST /api/v1/feed` promised a 280-character headline and a 2000-character
 * body while `publish_event()` kept 160 and 400, so a post was cut mid-word
 * behind a 201. 0013 raised the clamps; these tests hold the three layers —
 * the API schema, the demo adapter and the SQL — to one set of numbers,
 * `EVENT_TEXT_LIMITS`. The same writes against a real Postgres, through the
 * Supabase adapter, are `tests/integration/feed-limits.test.ts`.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FEED_LIMITS_MIGRATION = "0013_feed_limits.sql";

/** `length` characters that differ along their length, so any cut shows. */
function text(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, (_, index) => alphabet[index % alphabet.length]).join("");
}

function post(overrides: Partial<PublishEventInput> = {}): PublishEventInput {
  return {
    kind: "post",
    actor_type: "agent",
    actor_name: "Scout",
    headline: "A post",
    body: "",
    cta_label: "Read passport",
    cta_href: "/agents/scout",
    ...overrides,
  };
}

let repo: DemoRepository;

beforeEach(() => {
  repo = createDemoRepository({ now: () => SEED_EPOCH_MS });
});

describe("demo publishEvent", () => {
  it("stores a 280-character headline and a 2000-character body intact", async () => {
    const headline = text(EVENT_TEXT_LIMITS.headline);
    const body = text(EVENT_TEXT_LIMITS.body);
    expect(headline).toHaveLength(280);
    expect(body).toHaveLength(2000);

    const written = await repo.publishEvent(post({ headline, body }));
    expect(written.headline).toBe(headline);
    expect(written.body).toBe(body);

    const [stored] = await repo.listEvents({ kinds: ["post"], limit: 1 });
    expect(stored.id).toBe(written.id);
    expect(stored.headline).toBe(headline);
    expect(stored.body).toBe(body);
  });

  it("clamps past the limits exactly where publish_event()'s left() does", async () => {
    const written = await repo.publishEvent(
      post({
        actor_name: text(EVENT_TEXT_LIMITS.actor_name + 1),
        headline: text(EVENT_TEXT_LIMITS.headline + 1),
        body: text(EVENT_TEXT_LIMITS.body + 1),
        cta_label: text(EVENT_TEXT_LIMITS.cta_label + 1),
      }),
    );
    expect(written.actor_name).toBe(text(EVENT_TEXT_LIMITS.actor_name));
    expect(written.headline).toBe(text(EVENT_TEXT_LIMITS.headline));
    expect(written.body).toBe(text(EVENT_TEXT_LIMITS.body));
    expect(written.cta_label).toBe(text(EVENT_TEXT_LIMITS.cta_label));
    // The href is a guarded path, not clamped text.
    expect(written.cta_href).toBe("/agents/scout");
  });

  it("counts characters as Postgres does, so an emoji is never split", async () => {
    // 2001 characters, 2003 UTF-16 units: `left(…, 2000)` keeps one glove.
    const body = `${"a".repeat(1999)}🥊🥊`;
    const written = await repo.publishEvent(post({ body }));
    expect(written.body).toBe(`${"a".repeat(1999)}🥊`);
    expect(Array.from(written.body)).toHaveLength(EVENT_TEXT_LIMITS.body);

    // A null label stays null and an empty one empty, as `left()` leaves them.
    expect((await repo.publishEvent(post({ cta_label: null }))).cta_label).toBeNull();
    expect((await repo.publishEvent(post({ cta_label: "" }))).cta_label).toBe("");
  });
});

describe("the API schema and the SQL clamps are one set of numbers", () => {
  /** A migration's `publish_event()` declaration, `create` through `$$;`. */
  function declaration(sql: string, from: number): string {
    const end = sql.indexOf("\n$$;", from);
    if (end < 0) throw new Error("unterminated publish_event declaration");
    return sql.slice(from, end + "\n$$;".length);
  }

  /**
   * The `publish_event()` a database that ran every migration ends up with:
   * the last declaration in the last file that has one.
   */
  function lastPublishEvent(): { file: string; body: string } {
    let found: { file: string; body: string } | null = null;
    for (const file of readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const at = sql.lastIndexOf("create or replace function public.publish_event(");
      if (at >= 0) found = { file, body: declaration(sql, at) };
    }
    if (!found) throw new Error("no migration declares publish_event");
    return found;
  }

  function clamp(body: string, pattern: RegExp): number {
    const match = pattern.exec(body);
    if (!match) throw new Error(`no clamp matching ${pattern}`);
    return Number(match[1]);
  }

  it("publish_event() clamps at EVENT_TEXT_LIMITS, and only there", () => {
    const { file, body } = lastPublishEvent();
    expect(file >= FEED_LIMITS_MIGRATION, `${file} still declares publish_event() last`).toBe(true);

    expect({
      actor_name: clamp(body, /left\(coalesce\(p_actor_name, ''\), (\d+)\)/),
      headline: clamp(body, /left\(coalesce\(p_headline, ''\), (\d+)\)/),
      body: clamp(body, /left\(coalesce\(p_body, ''\), (\d+)\)/),
      cta_label: clamp(body, /left\(p_cta_label, (\d+)\)/),
    }).toEqual(EVENT_TEXT_LIMITS);
    expect(body.match(/\bleft\(/g)).toHaveLength(4);
  });

  it("POST /api/v1/feed accepts up to those limits and not a character more", () => {
    const schema = z.toJSONSchema(CreatePostSchema) as {
      properties: Record<string, { maxLength?: number }>;
    };
    expect(schema.properties.headline.maxLength).toBe(EVENT_TEXT_LIMITS.headline);
    expect(schema.properties.body.maxLength).toBe(EVENT_TEXT_LIMITS.body);

    const at = { headline: text(EVENT_TEXT_LIMITS.headline), body: text(EVENT_TEXT_LIMITS.body) };
    expect(CreatePostSchema.parse(at)).toEqual(at);
    expect(
      CreatePostSchema.safeParse({ ...at, headline: text(EVENT_TEXT_LIMITS.headline + 1) }).success,
    ).toBe(false);
    expect(CreatePostSchema.safeParse({ ...at, body: text(EVENT_TEXT_LIMITS.body + 1) }).success).toBe(
      false,
    );
  });

  it("0013 is 0012's publish_event() with only the headline and body clamps raised", () => {
    const read = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const league = read("0012_fight_league.sql");
    const limits = read(FEED_LIMITS_MIGRATION);
    const marker = "create or replace function public.publish_event(";
    const before = declaration(league, league.lastIndexOf(marker));
    const after = declaration(limits, limits.lastIndexOf(marker));

    expect(before).toContain("left(coalesce(p_headline, ''), 160)");
    expect(before).toContain("left(coalesce(p_body, ''), 400)");
    expect(after).not.toBe(before);
    expect(
      after
        .replace("left(coalesce(p_headline, ''), 280)", "left(coalesce(p_headline, ''), 160)")
        .replace("left(coalesce(p_body, ''), 2000)", "left(coalesce(p_body, ''), 400)"),
    ).toBe(before);

    // …and the same ACL, re-asserted.
    const acl = /^(?:revoke|grant) execute on function public\.publish_event\([^)]*\)\s+(?:from|to) [^;]+;/gm;
    const grants = (sql: string) => [...sql.matchAll(acl)].map((match) => match[0]).slice(-2);
    expect(grants(limits)).toEqual(grants(league));
    expect(grants(limits)).toHaveLength(2);
  });
});
