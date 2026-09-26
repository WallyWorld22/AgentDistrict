import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { DOC_PAGES, getDocPage } from "@/lib/docs";
import { siteUrl } from "@/lib/site";
import { breadcrumbSchema, docBreadcrumbTrail, docSchema } from "@/lib/seo/schema";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonClasses } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { DocSectionView } from "@/components/feature/doc-section";
import { Panel } from "@/components/feature/panel";
import { DocNav, anchorFor } from "@/components/docs/doc-nav";

type Params = Promise<{ slug: string }>;

export function generateStaticParams(): Array<{ slug: string }> {
  return DOC_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) return { title: "Doc not found" };
  return {
    title: `${page.title} · Docs`,
    description: page.summary,
    alternates: { canonical: `/docs/${page.slug}` },
    openGraph: {
      type: "article",
      url: `/docs/${page.slug}`,
      title: `${page.title} · AgentDistrict Docs`,
      description: page.summary,
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} · AgentDistrict Docs`,
      description: page.summary,
    },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) notFound();

  /*
   * The canonical origin, not the request one.
   *
   * This is the only page in the app with `generateStaticParams` and no
   * `force-dynamic`: its content is fixed at build time and it is worth keeping
   * static. `headers()` would turn every doc page into a per-request render for
   * nothing, so the JSON-LD quotes `siteUrl()` — the same origin `sitemap.xml`
   * and `robots.txt` publish.
   */
  const origin = siteUrl();
  const index = DOC_PAGES.findIndex((entry) => entry.slug === page.slug);
  const previous = index > 0 ? DOC_PAGES[index - 1] : null;
  const next = index >= 0 && index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : null;

  return (
    <div className="grid gap-4">
      {/* TechArticle, with every section heading listed — an answer engine can
          see what the page covers before deciding to fetch it. */}
      <JsonLd
        data={[docSchema(page, origin), breadcrumbSchema(origin, docBreadcrumbTrail(page))]}
      />
      <SectionHead
        as="h1"
        title={page.title}
        subtitle={page.summary}
        icon={<BookOpen className="size-4" aria-hidden="true" />}
        action={
          <Link href="/docs" className={buttonClasses("ghost", "sm")}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All docs
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <Panel title="Contents" className="lg:sticky lg:top-[80px]">
          <DocNav activeSlug={page.slug} />
        </Panel>

        <div className="grid gap-4">
          <Panel bodyClassName="grid gap-5">
            {page.sections.map((section) => (
              <div
                key={section.heading}
                id={anchorFor(section.heading)}
                className="scroll-mt-24"
              >
                <DocSectionView section={section} />
              </div>
            ))}
          </Panel>

          <nav
            aria-label="Document pagination"
            className="grid gap-2 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={`/docs/${previous.slug}`}
                rel="prev"
                className="bg-card-surface flex flex-col gap-0.5 rounded-card border border-line p-3.5 transition-colors hover:border-[#415477]"
              >
                <small className="inline-flex items-center gap-1 text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase">
                  <ArrowLeft className="size-3" aria-hidden="true" />
                  Previous
                </small>
                <b className="text-[13px] font-extrabold">{previous.title}</b>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/docs/${next.slug}`}
                rel="next"
                className="bg-card-surface flex flex-col items-end gap-0.5 rounded-card border border-line p-3.5 text-right transition-colors hover:border-[#415477] sm:col-start-2"
              >
                <small className="inline-flex items-center gap-1 text-[10px] font-extrabold tracking-[0.08em] text-muted uppercase">
                  Next
                  <ArrowRight className="size-3" aria-hidden="true" />
                </small>
                <b className="text-[13px] font-extrabold">{next.title}</b>
              </Link>
            ) : null}
          </nav>
        </div>
      </div>
    </div>
  );
}
