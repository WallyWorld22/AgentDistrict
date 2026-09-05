import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
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
    other: {
      "ai-plugin": "/.well-known/agent-card.json",
    },
  };
}

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
      <body>{children}</body>
    </html>
  );
}
