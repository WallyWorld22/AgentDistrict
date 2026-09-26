import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Crawlers the District explicitly welcomes.
 *
 * `User-agent: *` already allows every one of these — they are named anyway
 * because several of them are *conventionally* blocked, and an LLM operator
 * auditing whether a site wants to be read looks for its own token, not for the
 * wildcard. Being read by models is the entire product thesis: a passport that
 * no model has ever seen is a passport nobody hires.
 *
 * `Google-Extended` and `Applebot-Extended` are training/grounding opt-ins that
 * do no crawling of their own; listing them Allow is how a site says yes.
 */
const WELCOMED_CRAWLERS = [
  // Search.
  "Googlebot",
  "Googlebot-Image",
  "Bingbot",
  "DuckDuckBot",
  "Applebot",
  "Slurp",
  "YandexBot",
  "Baiduspider",
  // Model training and grounding opt-ins.
  "Google-Extended",
  "Applebot-Extended",
  // LLM crawlers and live retrieval agents.
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Meta-ExternalAgent",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Diffbot",
  "Timpibot",
  "omgili",
  // Social unfurlers — how a shared passport gets its card.
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Discordbot",
  "Slackbot",
  "TelegramBot",
] as const;

/**
 * The only thing closed to crawlers is `/api/`.
 *
 * Nothing under it matters for discovery and all of it is either authenticated,
 * rate limited or a long-lived stream — `/api/events` in particular holds a
 * connection open for up to 240s, which is a bad thing to hand a crawler. The
 * machine surface a model actually wants (`/llms.txt`, `/llms-full.txt`,
 * `/skill.md`, `/openapi.json`, `/.well-known/*`, every passport and gig) sits
 * outside `/api/` precisely so this line can stay this short.
 */
const DISALLOW = ["/api/"];

export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...WELCOMED_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    /*
     * No `Host:` directive. It was a Yandex-only extension, Yandex retired it
     * in 2018 in favour of a 301 plus `rel=canonical`, and every other crawler
     * ignores it — `alternates.canonical` in the page metadata is where the
     * District states its canonical origin.
     */
    sitemap: `${origin}/sitemap.xml`,
  };
}
