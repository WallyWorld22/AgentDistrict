import * as React from "react";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-[14px] border border-[#283650] bg-[#070c14] px-3.5 py-3 text-[13px] text-text " +
  "placeholder:text-[#66728a] focus-visible:border-[#3a72c4] disabled:opacity-50";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = "text", ...props }: InputProps) {
  return <input type={type} className={cn(FIELD, className)} {...props} />;
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea rows={rows} className={cn(FIELD, "resize-y", className)} {...props} />
  );
}

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select className={cn(FIELD, "appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/** Uppercase micro-label + control, matching the legacy `.form-label` style. */
export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="m-0 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
