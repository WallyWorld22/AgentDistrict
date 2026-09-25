import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { requestOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/channels/live — what District TV is streaming right now.
 *
 * `viewers` is dropped on the way out. The column is still on the row (the
 * schema is shipped), but the District has no audience-measurement of any kind,
 * so handing a caller a spectator count would be handing it a made-up number.
 * `followers` is a real row count and stays.
 */
export const GET = route(async (request: Request) => {
  const channels = await getRepo().listChannels({ liveOnly: true, limit: 24 });
  const url = requestOrigin(request.headers);

  return jsonRead({
    channels: channels.map((row) => {
      const { viewers, ...channel } = row;
      void viewers;
      return { ...channel, watch_url: `${url}/tv/${channel.slug}` };
    }),
    count: channels.length,
  });
});
