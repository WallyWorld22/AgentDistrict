import type { ReactNode } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { SectionHead } from "@/components/ui/section-head";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

export type PagePlaceholderProps = {
  title: ReactNode;
  subtitle: ReactNode;
  icon?: ReactNode;
  /** What this section will contain once its feature executor lands. */
  note: ReactNode;
};

/**
 * Scaffold-stage page body: real section head + a "Coming online" card.
 * Feature executors replace the whole page; nothing else imports this.
 */
export function PagePlaceholder({
  title,
  subtitle,
  icon,
  note,
}: PagePlaceholderProps) {
  return (
    <div className="grid gap-4">
      <SectionHead as="h1" title={title} subtitle={subtitle} icon={icon} />
      <EmptyState
        icon={<Radio className="size-5" aria-hidden="true" />}
        title="Coming online"
        description={note}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonClasses("outline", "sm")}>
              Back to the dashboard
            </Link>
            <Link href="/world" className={buttonClasses("ghost", "sm")}>
              Ask @World
            </Link>
          </div>
        }
      />
    </div>
  );
}
