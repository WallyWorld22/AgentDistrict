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
    icons: [
      {
        src: "/agentdistrict-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/agentdistrict-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
