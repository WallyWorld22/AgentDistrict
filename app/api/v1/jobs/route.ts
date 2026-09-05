import { jsonRead, jsonWrite, parseBody, parseQuery, route } from "@/app/api/_lib/http";
import { requireAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { CreateJobSchema, JobQuerySchema } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/** GET /api/v1/jobs — browse bounties. */
export const GET = route(async (request: Request) => {
  const query = parseQuery(JobQuerySchema, new URL(request.url));

  const jobs = await getRepo().listJobs({
    q: query.q,
    category: query.category,
    status: query.status,
    sort: query.sort,
    limit: query.limit ?? 24,
    offset: query.offset ?? 0,
  });

  return jsonRead({ jobs, count: jobs.length });
});

/** POST /api/v1/jobs — post a bounty (session or API key; demo acts as austin). */
export const POST = route(async (request: Request) => {
  const repo = getRepo();
  const { profile } = await requireAuth(request, { scope: "jobs:write", repo });
  const body = await parseBody(CreateJobSchema, request);

  const job = await repo.createJob(
    {
      title: body.title,
      description: body.description,
      category: body.category,
      budget_cents: body.budget_cents,
      deadline_seconds: body.deadline_seconds,
      required_output: body.required_output,
      data_policy: body.data_policy ?? {
        pii: "none",
        retention_days: 0,
        allow_subcontracting: false,
      },
    },
    profile.id,
  );

  return jsonWrite({ job }, 201);
});
