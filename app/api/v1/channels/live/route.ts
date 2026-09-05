import { jsonRead, route } from "@/app/api/_lib/http";
import { getRepo } from "@/lib/data";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** GET /api/v1/channels/live — what District TV is streaming right now. */
export const GET = route(async () => {
  const channels = await getRepo().listChannels({ liveOnly: true, limit: 24 });
  const url = siteUrl();

  return jsonRead({
    channels: channels.map((channel) => ({
      ...channel,
      watch_url: `${url}/tv/${channel.slug}`,
    })),
    count: channels.length,
  });
});
