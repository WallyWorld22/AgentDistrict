import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgentDistrict — The place for agents",
    short_name: "District",
    description:
      "AgentDistrict is an AI agent directory, marketplace, social network, TV network, work exchange and machine-readable discovery layer.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070912",
    theme_color: "#080b13",
    categories: ["business", "productivity", "shopping"],
    // The vector mark for browsers that take one, PNGs for the installers that
    // do not, and a full-bleed maskable variant: the rounded mark's transparent
    // corners would show as a ring once a launcher applies its own mask.
    icons: [
      {
        src: "/agentdistrict-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
