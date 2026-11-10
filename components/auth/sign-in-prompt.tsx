"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import { signInHref, signUpHref } from "@/lib/auth/return-to";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";

/**
 * The page the visitor is on, for a sign-in link to come back to.
 *
 * The path comes from the router, so it is right on the server render too.
 * The query string is read from `window.location` once hydrated (the server
 * render has none): `useSearchParams` would force a Suspense boundary on every
 * static page this is used from. `signInHref` re-checks the result, so
 * whatever is in the address bar can only ever produce a same-site path.
 */
export function useReturnPath(): string {
  const pathname = usePathname() ?? "/";
  const search = React.useSyncExternalStore(subscribeToHistory, readSearch, noSearch);
  return `${pathname}${search}`;
}

function subscribeToHistory(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
const readSearch = () => window.location.search;
const noSearch = () => "";

export type SignInLinksProps = {
  /** Where to come back to. Defaults to the current page. */
  next?: string;
  /** The sign-in link's label. */
  signInLabel?: string;
  /** Also offer "Create an account". */
  withSignUp?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
};

/** "Sign in" (and optionally "Create an account") links that return here. */
export function SignInLinks({
  next,
  signInLabel = "Sign in",
  withSignUp = false,
  size = "sm",
  className,
}: SignInLinksProps) {
  const here = useReturnPath();
  const target = next ?? here;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Link
        href={signInHref(target)}
        className={buttonClasses("primary", size)}
        data-testid="sign-in-link"
      >
        <LogIn className="size-3.5" aria-hidden="true" />
        {signInLabel}
      </Link>
      {withSignUp ? (
        <Link
          href={signUpHref(target)}
          className={buttonClasses("outline", size)}
          data-testid="sign-up-link"
        >
          Create an account
        </Link>
      ) : null}
    </div>
  );
}

export type SignInPromptProps = SignInLinksProps & {
  /** One line saying what signing in unlocks. */
  children: React.ReactNode;
};

/**
 * What a signed-out visitor sees **in place of** a control that needs an
 * account: one sentence and the links, never a form that is bound to fail.
 */
export function SignInPrompt({ children, className, ...links }: SignInPromptProps) {
  return (
    <div className={cn("grid gap-2", className)} data-testid="sign-in-prompt">
      <p className="m-0 text-[12px] leading-relaxed text-muted">{children}</p>
      <SignInLinks {...links} />
    </div>
  );
}

/**
 * A failed submit's message, plus a sign-in link when the failure was "no
 * account behind this request" — the one error a guest cannot fix in the form.
 */
export function SignInHint({ className }: { className?: string }) {
  const here = useReturnPath();
  return (
    <Link
      href={signInHref(here)}
      className={cn(
        "font-extrabold text-blue underline-offset-2 hover:text-cyan hover:underline",
        className,
      )}
      data-testid="sign-in-link"
    >
      Sign in
    </Link>
  );
}
