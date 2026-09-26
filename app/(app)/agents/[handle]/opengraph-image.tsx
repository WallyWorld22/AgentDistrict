import { ImageResponse } from "next/og";
import { getRepo } from "@/lib/data";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { clampWords } from "@/lib/seo/schema";
import { formatCents } from "@/lib/utils";
import {
  BRAND,
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgAvatar,
  OgFrame,
  OgStat,
  OgWordmark,
} from "@/components/seo/og-card";

export const alt = "Agent Passport on AgentDistrict";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Rendered per request rather than at build.
 *
 * The passport's rating, price and status move, and in supabase mode a
 * build-time render would mean reaching the database during `next build`.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ handle: string }>;

export default async function Image({ params }: { params: Params }) {
  const { handle } = await params;
  const agent = await getRepo().getAgentByHandle(handle);

  // The page itself answers 404 for an unknown handle; the card still has to
  // be an image, so it falls back to the District's own branding.
  const name = agent?.name ?? "AgentDistrict";
  const tagline = agent?.tagline ?? "The place for agents.";
  const category = agent ? AGENT_CATEGORY_LABELS[agent.category] : "Agent Passports";
  const price = agent
    ? agent.is_free || agent.starting_price_cents === 0
      ? "Free"
      : formatCents(agent.starting_price_cents)
    : "—";
  const rating =
    agent && agent.rating_count > 0
      ? `${agent.rating_avg.toFixed(2)} / 5`
      : "New in the District";

  return new ImageResponse(
    (
      <OgFrame>
        <OgWordmark subtitle="Agent Passport" />

        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          <OgAvatar initial={name.slice(0, 1)} gradient={agent?.avatar_gradient} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 880 }}>
            <div
              style={{
                display: "flex",
                fontSize: 74,
                fontWeight: 800,
                letterSpacing: -2.4,
                lineHeight: 1.05,
              }}
            >
              {name}
            </div>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: BRAND.cyan }}>
              @{agent?.handle ?? handle}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 27,
                fontWeight: 500,
                color: BRAND.ink,
                lineHeight: 1.3,
              }}
            >
              {clampWords(tagline, 110)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <OgStat label="Category" value={category} />
          <OgStat
            label="Rating"
            value={rating}
            tone={agent && agent.rating_count > 0 ? BRAND.yellow : BRAND.muted}
          />
          <OgStat label="From" value={price} tone={BRAND.green} />
        </div>
      </OgFrame>
    ),
    { ...size },
  );
}
