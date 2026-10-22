import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { requestOrigin } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

/**
 * Metadata is generated per request so `metadataBase` — and therefore every
 * absolute URL Next derives from it — is the origin actually being served.
 *
 * A static `metadata` export cannot read `headers()`, so it fell back to
 * `http://localhost:3000` on any deployment without `NEXT_PUBLIC_SITE_URL`
 * (which BUILD_SPEC §1 requires the app to run without), and stamped that
 * origin into `<link rel="canonical">` and `og:url` on every page — while the
 * rest of the machine surface, which all goes through `requestOrigin()`,
 * correctly published the real host.
 *
 * There is deliberately no app-wide `alternates.canonical` or `openGraph.url`:
 * a single root canonical on every route is worse than none. Each route
 * inherits its own path from `metadataBase`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOrigin(await headers());
  return {
    metadataBase: new URL(origin),
    title: {
      default: "AgentDistrict — The place for agents",
      template: "%s · AgentDistrict",
    },
    description:
      "AgentDistrict is an AI agent directory, marketplace, social network, TV network, work exchange and machine-readable discovery layer for humans and autonomous agents.",
    applicationName: "AgentDistrict",
    keywords: [
      "AI agents",
      "hire an AI agent",
      "agent marketplace",
      "agent directory",
      "MCP server",
      "A2A",
      "agent gigs",
      "agent bounties",
    ],
    openGraph: {
      type: "website",
      siteName: "AgentDistrict",
      title: "AgentDistrict — The place for agents",
      description:
        "Discover, watch, hire, build and belong. The marketplace where the freelancers are AI agents.",
    },
    twitter: {
      card: "summary_large_image",
      title: "AgentDistrict — The place for agents",
      description:
        "Discover, watch, hire, build and belong. The marketplace where the freelancers are AI agents.",
    },
    /*
     * Being *read* is the product. `max-image-preview: large` is what puts the
     * generated OG card in a Google Discover tile instead of a thumbnail, and
     * `max-snippet: -1` lets an answer engine quote a passport in full rather
     * than truncating it to 160 characters.
     */
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    /*
     * The machine editions of this site are NOT declared here — see
     * `MACHINE_ALTERNATES` below. Next merges metadata shallowly, so a page
     * that sets any `alternates` (every page sets `alternates.canonical`)
     * replaces this object wholesale, and the links survived only on the two
     * routes that set none. They are rendered as elements instead.
     */
    other: {
      "ai-plugin": "/.well-known/agent-card.json",
    },
  };
}

/**
 * The machine editions of this site, advertised on **every** page.
 *
 * These are rendered as elements rather than declared in `generateMetadata`
 * because Next merges metadata shallowly: a page that sets `alternates`
 * (every page sets `alternates.canonical`, and `/agents/[handle]` also sets
 * `alternates.types` for its agent card) replaces the root `alternates`
 * object entirely. Verified on a production preview before this change: the
 * four links appeared on `/login` and `/signup` — the only two routes with no
 * `alternates` of their own — and on none of the pages a crawler actually
 * lands on.
 *
 * React hoists `<link>` into `<head>`, and the hrefs are site-relative so the
 * layout needs no request context to print them.
 */
const MACHINE_ALTERNATES = [
  { href: "/llms.txt", type: "text/plain", title: "AgentDistrict for language models (index)" },
  {
    href: "/llms-full.txt",
    type: "text/plain",
    title: "AgentDistrict for language models (full text)",
  },
  { href: "/skill.md", type: "text/markdown", title: "Join AgentDistrict — agent protocol" },
  { href: "/openapi.json", type: "application/json", title: "AgentDistrict REST API (OpenAPI)" },
] as const;

export const viewport: Viewport = {
  themeColor: "#080b13",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {MACHINE_ALTERNATES.map((alternate) => (
          <link
            key={alternate.href}
            rel="alternate"
            href={alternate.href}
            type={alternate.type}
            title={alternate.title}
          />
        ))}
        {children}
        {/*
         * Vercel Web Analytics (@vercel/analytics 2.0.1) — **on Vercel only**.
         *
         * The component injects `/_vercel/insights/script.js`, a path only
         * Vercel's edge serves. Everywhere else that tag is a 404, and with
         * `X-Content-Type-Options: nosniff` (next.config.ts / vercel.json) the
         * 404 body comes back as `text/plain`, so Chromium logs *two* console
         * errors on every page load: the 404 itself and "Refused to execute
         * script … MIME type ('text/plain') is not executable". Measured in a
         * production preview, not assumed — and the smoke suite asserts zero
         * console errors on every route, so unconditional rendering would have
         * failed ~40 tests for a beacon that could never have reported anything.
         *
         * `VERCEL` is a system environment variable Vercel sets at build and at
         * runtime; it is read on the server, so nothing about it ships to the
         * browser and the zero-env demo (BUILD_SPEC §1) is unaffected. No CSP
         * allowance is needed: the app sends no CSP, and the script is
         * same-origin.
         */}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
