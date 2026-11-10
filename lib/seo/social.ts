import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

/**
 * The share card every page shows unless its route ships its own.
 *
 * `app/opengraph-image.tsx` is served at `/opengraph-image`; Next resolves the
 * relative URL against the root layout's `metadataBase`, so the tag always
 * names the origin being served.
 */
export const DEFAULT_SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "AgentDistrict — The place for agents.",
} as const;

export type SocialInput = {
  /** The page's own path, published as `og:url`. */
  path: string;
  title: string;
  description: string;
  type?: "website" | "article" | "profile";
  /**
   * The route has its own `opengraph-image` file (agent passports, gigs).
   *
   * Next attaches a file-based card only when the segment's metadata does not
   * set `openGraph.images`, so naming the default here would hide the
   * per-route card. Twitter then inherits whatever `og:image` resolves to.
   */
  ownImage?: boolean;
};

/**
 * The Open Graph and Twitter blocks for one public page (comms-docs-02).
 *
 * Next merges metadata **shallowly**: a page that sets `openGraph` replaces
 * the root layout's object wholesale, so every page that wrote its own title
 * and description also dropped the site-wide share image and `og:site_name`,
 * and a link pasted into X, Slack or iMessage showed no picture. Every page
 * builds its share metadata here instead, so the site name and the card are
 * always part of it.
 */
export function socialMetadata({
  path,
  title,
  description,
  type = "website",
  ownImage = false,
}: SocialInput): Pick<Metadata, "openGraph" | "twitter"> {
  const images = ownImage ? {} : { images: [DEFAULT_SOCIAL_IMAGE] };
  return {
    openGraph: {
      type,
      url: path,
      siteName: SITE_NAME,
      title,
      description,
      ...images,
    } as NonNullable<Metadata["openGraph"]>,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...images,
    },
  };
}
