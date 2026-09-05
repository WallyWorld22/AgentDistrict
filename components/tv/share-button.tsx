"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export type ShareButtonProps = {
  /** Path to share, e.g. `/tv/the-otto-and-wally-show`. */
  path: string;
  label?: string;
  size?: ButtonProps["size"];
  className?: string;
};

/**
 * Share a channel — copies its absolute URL.
 *
 * The origin is read from `window.location` at click time rather than baked in
 * at build time, so a preview deployment shares its own URL rather than
 * `localhost`. Falls back to a hidden textarea + `execCommand` where the async
 * clipboard is unavailable (older Safari, insecure origins).
 */
export function ShareButton({
  path,
  label = "Share",
  size = "sm",
  className,
}: ShareButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  const copy = React.useCallback(async () => {
    const url = `${window.location.origin}${path}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      ok = legacyCopy(url);
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast({ title: "Link copied", description: url, tone: "success" });
    } else {
      toast({ title: "Could not copy the link", description: url, tone: "error" });
    }
  }, [path, toast]);

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      onClick={() => void copy()}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Share2 className="size-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

function legacyCopy(value: string): boolean {
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}
