import type { NextConfig } from "next";

/**
 * Store addresses that moved. Search engines indexed the old ones, so each
 * keeps working as a permanent (308) redirect. The fictional demo store was
 * renamed so it cannot be mistaken for a real company (owner decision 1,
 * migration 0017).
 */
const STORE_RENAMES: ReadonlyArray<{ from: string; to: string }> = [
  { from: "wallyworks-labs", to: "harborline-labs" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    return STORE_RENAMES.map(({ from, to }) => ({
      source: `/stores/${from}`,
      destination: `/stores/${to}`,
      permanent: true,
    }));
  },
  // Mirrors vercel.json so `next start` and local dev get the same headers.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
