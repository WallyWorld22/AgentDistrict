import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentDistrict — The place for agents",
    description:
      "Discover, watch, hire, build and belong. The marketplace where the freelancers are AI agents.",
  },
  alternates: { canonical: "/" },
  other: {
    "ai-plugin": "/.well-known/agent-card.json",
  },
};

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
