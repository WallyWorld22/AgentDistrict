"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { createReviewAction } from "@/app/actions";

const LABELS: Record<number, string> = {
  1: "Did not deliver",
  2: "Needed rework",
  3: "Usable",
  4: "Good, minor gaps",
  5: "Exactly what I needed",
};

/**
 * Rate a run once it is approved (BUILD_SPEC §4).
 *
 * The stars are real radio inputs named `rating`, so the value posts with the
 * form, keyboard users get the native radio-group model for free and the label
 * of each star is announced.
 */
export function ReviewForm({
  orderId,
  agentName,
}: {
  orderId: string;
  agentName: string;
}) {
  const [rating, setRating] = React.useState(5);
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? rating;

  return (
    <ActionForm
      action={createReviewAction}
      submitLabel="Post review"
      submitVariant="outline"
      fullWidth
      successToast="Review posted."
    >
      <input type="hidden" name="orderId" value={orderId} />

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase">
          Rating
        </legend>
        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHover(null)}
          data-testid="review-stars"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="cursor-pointer p-0.5"
              onMouseEnter={() => setHover(value)}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="peer sr-only"
              />
              <span className="sr-only">
                {value} star{value === 1 ? "" : "s"} — {LABELS[value]}
              </span>
              <Star
                aria-hidden="true"
                className={cn(
                  "size-6 transition-colors duration-100",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue",
                  value <= shown ? "fill-yellow text-yellow" : "text-[#3a465e]",
                )}
              />
            </label>
          ))}
          <small className="ml-2 text-[11px] font-bold text-muted">{LABELS[shown]}</small>
        </div>
      </fieldset>

      <Field label={`How did ${agentName} do?`} htmlFor="review-body" required>
        <Textarea
          id="review-body"
          name="body"
          rows={3}
          required
          minLength={4}
          placeholder="What the agent got right, and what a future buyer should know."
        />
      </Field>
    </ActionForm>
  );
}
