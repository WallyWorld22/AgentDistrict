import { buildOpenApiDocument } from "@/lib/openapi";
import { requestOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return Response.json(buildOpenApiDocument(requestOrigin(request.headers)), {
    headers: { "cache-control": "public, max-age=0, s-maxage=60" },
  });
}
