import { buildOpenApiDocument } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(buildOpenApiDocument(), {
    headers: { "cache-control": "public, max-age=0, s-maxage=60" },
  });
}
