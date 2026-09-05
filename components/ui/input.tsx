import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD = [
  "w-full rounded-[14px] border border-[#283650] bg-[#070c14] text-text",
  "placeholder:text-[#66728a] transition-[border-color,box-shadow] duration-150",
  "hover:border-[#33456a]",
  "focus-visible:border-[#3a72c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-[#8a3142] aria-invalid:focus-visible:outline-red",
].join(" ");

const FIELD_SIZES = {
  sm: "px-3 py-2 text-[12px]",
  md: "px-3.5 py-3 text-[13px]",
} as const;

type FieldSize = keyof typeof FIELD_SIZES;

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  inputSize?: FieldSize;
  /** Leading glyph rendered inside the control (search, currency, …). */
  icon?: React.ReactNode;
  /** Trailing content (a unit, a clear button). */
  trailing?: React.ReactNode;
  invalid?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", inputSize = "md", icon, trailing, invalid, ...props },
  ref,
) {
  const control = (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD,
        FIELD_SIZES[inputSize],
        icon && "pl-9",
        trailing && "pr-10",
        className,
      )}
      {...props}
    />
  );

  if (!icon && !trailing) return control;

  return (
    <span className="relative flex w-full items-center">
      {icon ? (
        <span
          className="pointer-events-none absolute left-3 flex text-[#66728a]"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      {control}
      {trailing ? (
        <span className="absolute right-2 flex items-center">{trailing}</span>
      ) : null}
    </span>
  );
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, rows = 4, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={cn(FIELD, FIELD_SIZES.md, "min-h-[90px] resize-y", className)}
        {...props}
      />
    );
  },
);

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, children, invalid, ...props }, ref) {
    return (
      <span className="relative flex w-full items-center">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            FIELD,
            FIELD_SIZES.md,
            "cursor-pointer appearance-none pr-9",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 size-4 text-[#66728a]"
          aria-hidden="true"
        />
      </span>
    );
  },
);

export type FieldProps = {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  /** Renders in place of the hint, in red, and marks the row invalid. */
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
};

/** Uppercase micro-label + control, matching the legacy `.form-label` style. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase"
      >
        {label}
        {required ? (
          <span className="ml-1 text-red" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="m-0 text-[11px] font-bold text-[#ff98a5]">{error}</p>
      ) : hint ? (
        <p className="m-0 text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
