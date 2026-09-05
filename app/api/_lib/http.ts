import type { z } from "zod";
import { ValidationError, toDistrictError } from "@/lib/data/errors";

/**
 * Shared plumbing for `/api/v1` (BUILD_SPEC §4): one error envelope, one set of
 * cache rules, one place that turns zod issues into a 400.
 *
 * `app/api/_lib` is a private folder — Next.js never routes it — so these
 * helpers can live next to the handlers that use them.
 */

/** Reads are edge-cacheable for 30s; the District moves, but not that fast. */
export const READ_CACHE = "public, max-age=0, s-maxage=30, stale-while-revalidate=60";
export const NO_STORE = "no-store";

export function jsonRead(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": READ_CACHE, "x-district-mode": "read" },
  });
}

export function jsonWrite(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": NO_STORE } });
}

/** `{ error: { code, message } }` — the only error shape this API emits. */
export function jsonError(error: unknown): Response {
  const districtError = toDistrictError(error);
  return Response.json(
    {
      error: {
        code: districtError.code,
        message: districtError.message,
        ...(districtError.details !== undefined ? { details: districtError.details } : {}),
      },
    },
    { status: districtError.status, headers: { "cache-control": NO_STORE } },
  );
}

/** Wrap a handler so every thrown `DistrictError` becomes its envelope. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

function describeIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/** Validate `?a=b&c=d` against a schema, or throw a 400 with the issues. */
export function parseQuery<T extends z.ZodType>(schema: T, url: URL): z.output<T> {
  const result = schema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!result.success) {
    throw new ValidationError("Invalid query parameters", describeIssues(result.error));
  }
  return result.data;
}

/** Read + validate a JSON body, or throw a 400. */
export async function parseBody<T extends z.ZodType>(
  schema: T,
  request: Request,
): Promise<z.output<T>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError("Invalid request body", describeIssues(result.error));
  }
  return result.data;
}
