import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export type EmptyStateProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center gap-3 px-5 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          className="grid size-12 place-items-center rounded-[18px] border border-[#263753] bg-[#121e36] text-[22px] text-blue"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <div className="max-w-prose">
        <b className="block text-[15px] font-extrabold">{title}</b>
        {description ? (
          <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-pretty text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </Card>
  );
}
