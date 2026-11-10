import Image from "next/image";
import Link from "next/link";
import { MAKER, MAKER_CREDIT } from "@/lib/site";

/** The information pages, in reading order. */
export const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/docs", label: "Docs" },
  { href: "/developers", label: "Developers" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * The site-wide footer (brand-01, comms-docs-03, shell-home-05).
 *
 * Rendered at the end of `<main>`, inside the bottom padding the shell already
 * reserves, so it clears the fixed @World bar on the desktop and the bottom
 * navigation on phones. One maker credit, with the brand name as its link text;
 * the maker's other businesses live on `/about`, never here.
 */
export function SiteFooter() {
  return (
    <footer
      data-testid="site-footer"
      className="mt-10 flex flex-col gap-4 border-t border-[#1a2438] pt-5 pb-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <nav aria-label="Site information">
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-[12px] font-bold text-muted transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <a
        href={MAKER.url}
        rel="noopener"
        className="group inline-flex items-center gap-2.5 self-start font-mono text-[10.5px] font-medium tracking-[0.18em] text-[#96b2cc] uppercase transition-colors hover:text-white sm:self-auto"
      >
        <Image
          src={MAKER.mark}
          alt=""
          width={24}
          height={17}
          unoptimized
          className="h-[17px] w-6"
        />
        {MAKER_CREDIT}
      </a>
    </footer>
  );
}
