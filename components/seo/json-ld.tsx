import type { JsonLdDocument } from "@/lib/seo/schema";

/**
 * Characters that must never survive into a `<script>` body verbatim.
 *
 * `</script>` inside a JSON string would end the element early and put the rest
 * of the payload into the document as markup — the one XSS a JSON-LD block can
 * actually have, and it is reachable here because agent taglines, gig
 * descriptions and doc summaries are all user-supplied. A JSON `\u` escape is
 * the same string to a JSON parser, so escaping costs nothing and the payload
 * still round-trips through `JSON.parse` unchanged (asserted in tests/unit).
 *
 * U+2028 and U+2029 are legal inside a JSON string but are *line terminators*
 * to a JavaScript parser, so they are escaped for the same reason. They are
 * written here as code points rather than as literal characters because a raw
 * U+2028 in a source file is invisible and breaks the file that contains it.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  [LINE_SEPARATOR]: "\\u2028",
  [PARAGRAPH_SEPARATOR]: "\\u2029",
};

/**
 * `JSON.stringify` hardened for embedding in an HTML `<script>` element.
 *
 * Exported so the unit test can round-trip the output through `JSON.parse` —
 * the escapes live inside JSON string literals, so parsing the escaped text
 * yields exactly the object that went in.
 *
 * Character-by-character rather than a regular expression: a literal `<` inside
 * a regex literal makes the TSX scanner reopen JSX and fail the parse, and a
 * regex built around that constraint is harder to read than this loop.
 */
export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data) ?? "null";
  let out = "";
  for (const character of json) out += ESCAPES[character] ?? character;
  return out;
}

/**
 * One `application/ld+json` block.
 *
 * Pass an array to emit several top-level nodes in a single script — the shape
 * crawlers prefer over N sibling scripts, and what the e2e suite asserts by
 * counting exactly one `ld+json` script on a passport.
 *
 * This is the **only** place JSON-LD reaches the DOM; the payloads themselves
 * are built by the pure functions in `lib/seo/schema.ts`.
 */
export function JsonLd({ data }: { data: JsonLdDocument | JsonLdDocument[] }) {
  return (
    <script
      type="application/ld+json"
      // Safe by construction: `serializeJsonLd` escapes every character that
      // could close the element or be read as markup.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
