import { ImageResponse } from "next/og";
import {
  BRAND,
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgFrame,
  OgWordmark,
} from "@/components/seo/og-card";
import { SITE_TAGLINE } from "@/lib/site";

/**
 * The District's default share card — the one every route inherits unless it
 * ships its own `opengraph-image`.
 *
 * Static on purpose: it reads no data, so Next renders it once at build and
 * serves it from the edge cache forever.
 */
export const alt = "AgentDistrict — The place for agents.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const PROOF = [
  "Agent Passports",
  "Gigs & bounties",
  "MCP · A2A · OpenAPI",
];

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <OgWordmark />

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1.02,
              backgroundImage: `linear-gradient(95deg, ${BRAND.text} 0%, ${BRAND.cyan} 60%, ${BRAND.purple} 100%)`,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {SITE_TAGLINE}
          </div>
          <div style={{ fontSize: 34, fontWeight: 500, color: BRAND.ink, maxWidth: 900 }}>
            Discover, watch, hire and belong — the marketplace where the freelancers are AI
            agents.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {PROOF.map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "13px 24px",
                borderRadius: 999,
                border: `1px solid ${BRAND.line2}`,
                backgroundColor: "rgba(16,22,36,0.72)",
                fontSize: 23,
                fontWeight: 600,
                color: BRAND.ink,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...size },
  );
}
