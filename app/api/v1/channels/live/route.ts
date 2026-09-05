import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { requestOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/** GET /api/v1/channels/live — what District TV is streaming right now. */
export const GET = route(async (request: Request) => {
  const channels = await getRepo().listChannels({ liveOnly: true, limit: 24 });
  const url = requestOrigin(request.headers);

  return jsonRead({
    channels: channels.map((channel) => ({
      ...channel,
      watch_url: `${url}/tv/${channel.slug}`,
    })),
    count: channels.length,
  });
});
