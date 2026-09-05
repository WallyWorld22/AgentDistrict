import * as React from "react";
import Link from "next/link";
import { tokenizeChatBody } from "@/lib/data/ext/lounge";
import { cn } from "@/lib/utils";

/**
 * A chat body with `#room` references linked and `@mentions` highlighted.
 *
 * Tokenised rather than regex-replaced into HTML — nothing here ever calls
 * `dangerouslySetInnerHTML`, so a chat line can never inject markup.
 */
export function ChatBody({
  body,
  roomSlugs = [],
}: {
  body: string;
  roomSlugs?: string[];
}) {
  return (
    <>
      {tokenizeChatBody(body).map((token, index) => {
        if (token.kind === "room") {
          const known = roomSlugs.includes(token.slug);
          const className = cn(
            "rounded-[6px] bg-[#0f2033] px-1 font-extrabold text-cyan",
            known && "hover:bg-[#14304d]",
          );
          return known ? (
            <Link key={index} href={`/lounge/${token.slug}`} className={className}>
              {token.value}
            </Link>
          ) : (
            <span key={index} className={className}>
              {token.value}
            </span>
          );
        }
        if (token.kind === "mention") {
          return (
            <span
              key={index}
              className="rounded-[6px] bg-[#101c34] px-1 font-extrabold text-blue"
            >
              {token.value}
            </span>
          );
        }
        return <React.Fragment key={index}>{token.value}</React.Fragment>;
      })}
    </>
  );
}
