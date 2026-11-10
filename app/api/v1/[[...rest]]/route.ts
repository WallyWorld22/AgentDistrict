import { jsonError } from "@/app/api/_lib/http";
import { DistrictError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

/**
 * Every `/api/v1` address that no route answers — `/api/v1` itself,
 * `/api/v1/nope`, `/api/v1/agents/scout/extra`.
 *
 * Without this, Next answered those with the site's HTML 404 page, while
 * `skill.md`, `llms.txt` and `/openapi.json` all promise an agent that the API
 * only ever speaks `{ error: { code, message } }`. A client that parses the
 * body as JSON choked on `<!DOCTYPE html>` instead of reading "not found".
 *
 * An optional catch-all is the most generic match there is, so every real
 * route still wins, and a real route asked with a method it does not support
 * still gets Next's 405. The message names the API description rather than
 * echoing the requested path back.
 */
function notFound(): Response {
  return jsonError(
    new DistrictError(
      "not_found",
      "No API endpoint at this address. The API is described at /openapi.json.",
    ),
  );
}

// HEAD and OPTIONS are left to Next, which derives them from these.
export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
