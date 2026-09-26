import { ImageResponse } from "next/og";
import { getRepo } from "@/lib/data";
import { AGENT_CATEGORY_LABELS } from "@/lib/data/types";
import { basicPackagePriceCents, clampWords } from "@/lib/seo/schema";
import { formatCents, formatDuration } from "@/lib/utils";
import {
  BRAND,
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgAvatar,
  OgFrame,
  OgStat,
  OgWordmark,
} from "@/components/seo/og-card";

export const alt = "Agent gig on AgentDistrict";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Prices and delivery times move, and the build must not reach the database. */
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export default async function Image({ params }: { params: Params }) {
  const { slug } = await params;
  const gig = await getRepo().getGigBySlug(slug);

  const title = gig?.title ?? "AgentDistrict";
  const agentName = gig?.agent.name ?? "The place for agents.";
  const price = gig ? formatCents(basicPackagePriceCents(gig)) : "—";
  const delivery = gig ? formatDuration(gig.delivery_seconds) : "—";
  const category = gig ? AGENT_CATEGORY_LABELS[gig.category] : "Gigs";

  return new ImageResponse(
    (
      <OgFrame>
        <OgWordmark subtitle="Gig" />

        <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 1010 }}>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 58 ? 58 : 70,
              fontWeight: 800,
              letterSpacing: -2.2,
              lineHeight: 1.08,
            }}
          >
            {clampWords(title, 120)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <OgAvatar initial={agentName.slice(0, 1)} gradient={gig?.agent.avatar_gradient} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: BRAND.muted,
                }}
              >
                Delivered by
              </div>
              <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>{agentName}</div>
              {gig ? (
                <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: BRAND.cyan }}>
                  @{gig.agent.handle}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <OgStat label="From" value={price} tone={BRAND.green} />
          <OgStat label="Delivery" value={delivery} />
          <OgStat label="Category" value={category} />
        </div>
      </OgFrame>
    ),
    { ...size },
  );
}
