"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type ChipInputProps = {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** One-tap chips offered under the field. */
  suggestions?: readonly string[];
  suggestionsLabel?: string;
  required?: boolean;
  max?: number;
};

/**
 * A list of short strings edited as chips (skills, regions, MCP tool names).
 *
 * Enter or a comma commits the draft term, Backspace on an empty field removes
 * the last chip, and each chip has its own labelled remove button — so the
 * control is fully operable from the keyboard and every target is a real
 * button rather than a click handler on a span.
 */
export function ChipInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  hint,
  error,
  suggestions,
  suggestionsLabel = "Suggestions",
  required = false,
  max = 12,
}: ChipInputProps) {
  const [draft, setDraft] = React.useState("");
  const full = values.length >= max;

  function add(term: string) {
    const value = term.trim().replace(/,+$/, "").slice(0, 48);
    if (!value) return;
    const exists = values.some((v) => v.toLowerCase() === value.toLowerCase());
    if (exists || values.length >= max) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  }

  function remove(term: string) {
    onChange(values.filter((value) => value !== term));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && values.length > 0) {
      event.preventDefault();
      remove(values[values.length - 1]);
    }
  }

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={id}
        className="text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase"
      >
        {label}
        {required ? (
          <span className="ml-1 text-red" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {values.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {values.map((value) => (
            <li key={value}>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#2b4a7d] bg-[#0f2036] py-1 pr-1 pl-2.5 text-[11px] font-extrabold text-[#a9d4ff]">
                {value}
                <button
                  type="button"
                  onClick={() => remove(value)}
                  aria-label={`Remove ${value}`}
                  className="grid size-5 place-items-center rounded-full text-[#7f9ec4] transition-colors hover:bg-white/10 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={full ? `That is ${max} — remove one to add another` : placeholder}
          disabled={full}
          invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          inputSize="sm"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={full || draft.trim() === ""}
          aria-label={`Add to ${label.toLowerCase()}`}
          className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-[#2a3550] bg-[#101829] text-ink transition-colors hover:border-[#3d4d73] hover:text-text disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-extrabold tracking-[0.05em] text-muted uppercase">
            {suggestionsLabel}
          </span>
          {suggestions.map((suggestion) => {
            const chosen = values.some(
              (value) => value.toLowerCase() === suggestion.toLowerCase(),
            );
            return (
              <button
                key={suggestion}
                type="button"
                aria-pressed={chosen}
                onClick={() => (chosen ? remove(suggestion) : add(suggestion))}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10.5px] font-extrabold transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
                  chosen
                    ? "border-transparent bg-grad-primary text-white"
                    : "border-line bg-[#0b111d] text-[#a8b4ca] hover:border-[#33415f] hover:text-text",
                )}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p id={`${id}-error`} className="m-0 text-[11px] font-bold text-[#ff98a5]">
          {error}
        </p>
      ) : hint ? (
        <p className="m-0 text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
