import type { ReactNode } from "react";

/**
 * The shared frame behind every `opengraph-image` route.
 *
 * These elements are rendered by **satori**, not by a browser: there is no
 * cascade, no CSS variables and no Tailwind, every element holding more than
 * one child needs an explicit `display: flex`, and only a small subset of CSS
 * is understood. That is why the design tokens are repeated here as literals
 * instead of imported from `app/globals.css` — satori never sees that file.
 *
 * Nothing here fetches. No web font is loaded (`ImageResponse` falls back to
 * the Geist face bundled inside `next/og`) and no emoji is rendered, because
 * satori resolves emoji through a public CDN at render time and an OG card must
 * not depend on a third-party host being up.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/** The subset of the District palette the cards use. Mirrors `@theme`. */
export const BRAND = {
  bg: "#070912",
  card: "#101624",
  line: "#202a3e",
  line2: "#2b3752",
  text: "#f7f9ff",
  ink: "#c3cce0",
  muted: "#8e9ab2",
  blue: "#48a8ff",
  cyan: "#4ee7ff",
  purple: "#8e5cff",
  green: "#46e39a",
  yellow: "#ffd66b",
} as const;

/** The dark district gradient plus two accent glows, as positioned layers. */
export function OgFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: BRAND.bg,
        backgroundImage: "linear-gradient(135deg, #070912 0%, #0b1020 55%, #120d2b 100%)",
        color: BRAND.text,
        overflow: "hidden",
      }}
    >
      {/* Glow layers. Separate absolutely-positioned circles rather than a
          multi-stop background, which satori renders inconsistently. */}
      <div
        style={{
          position: "absolute",
          top: -260,
          left: -160,
          width: 760,
          height: 760,
          borderRadius: 9999,
          backgroundImage:
            "radial-gradient(circle, rgba(72,168,255,0.30) 0%, rgba(72,168,255,0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -300,
          right: -180,
          width: 820,
          height: 820,
          borderRadius: 9999,
          backgroundImage:
            "radial-gradient(circle, rgba(142,92,255,0.32) 0%, rgba(142,92,255,0) 70%)",
        }}
      />
      {/* The lit horizon line along the bottom edge. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          backgroundImage: `linear-gradient(90deg, ${BRAND.blue} 0%, ${BRAND.cyan} 45%, ${BRAND.purple} 100%)`,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The mark + wordmark lockup, used as the header of every card. */
export function OgWordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 60,
          height: 60,
          borderRadius: 18,
          backgroundImage: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.purple} 100%)`,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: -1,
          color: "#ffffff",
        }}
      >
        AD
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.6 }}>AgentDistrict</div>
        {subtitle ? (
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: BRAND.cyan,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A labelled figure — rating, price, category, delivery. */
export function OgStat({
  label,
  value,
  tone = BRAND.text,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "18px 26px",
        borderRadius: 16,
        border: `1px solid ${BRAND.line}`,
        backgroundColor: "rgba(16,22,36,0.72)",
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: BRAND.muted,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: tone, letterSpacing: -0.8 }}>{value}</div>
    </div>
  );
}

/**
 * A square avatar tile carrying the entity's own gradient and its initial.
 *
 * Deliberately not the agent's `avatar_emoji`: see the note at the top of this
 * file about satori fetching emoji over the network.
 */
export function OgAvatar({ initial, gradient }: { initial: string; gradient?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 124,
        height: 124,
        borderRadius: 32,
        border: `1px solid ${BRAND.line2}`,
        backgroundImage:
          gradient && gradient.includes("gradient")
            ? gradient
            : `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.purple} 100%)`,
        fontSize: 58,
        fontWeight: 800,
        color: "#ffffff",
      }}
    >
      {initial.toUpperCase()}
    </div>
  );
}
