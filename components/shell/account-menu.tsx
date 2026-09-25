"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { initialsFrom } from "@/components/ui/avatar";
import { ActionForm } from "@/components/feature/action-form";
import { signOutAction } from "@/app/(auth)/actions";

export type AccountAvatar = {
  emoji: string;
  /** A CSS gradient resolved from `AVATAR_GRADIENTS` — never free text. */
  gradient: string;
};

export type AccountMenuProps = {
  /** False for a visitor with no session: the chip becomes a "Sign in" link. */
  signedIn: boolean;
  displayName: string;
  /** "Builder Mode" for a creator, "Member" otherwise. */
  roleLabel: string;
  /** The District avatar from `/settings`, or `null` for initials. */
  avatar: AccountAvatar | null;
};

const ITEM_SELECTOR = '[role="menuitem"]';

const itemClasses = cn(
  "flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-left",
  "text-[12.5px] font-bold text-ink transition-colors",
  "hover:bg-white/6 hover:text-white focus-visible:bg-white/6 focus-visible:text-white",
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue",
);

/** The avatar square shown in the chip and at the top of the menu. */
function ChipAvatar({
  avatar,
  displayName,
  className,
}: {
  avatar: AccountAvatar | null;
  displayName: string;
  className?: string;
}) {
  if (avatar) {
    return (
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full text-[16px] leading-none ring-2 ring-[#2b3550]",
          className,
        )}
        style={{ backgroundImage: avatar.gradient }}
        aria-hidden="true"
      >
        {avatar.emoji}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f0b45c] to-[#a4642a]",
        "text-[12px] font-extrabold text-[#2a1608] ring-2 ring-[#2b3550]",
        className,
      )}
      aria-hidden="true"
    >
      {initialsFrom(displayName)}
    </span>
  );
}

/**
 * The top bar's account control (BUILD_SPEC §3).
 *
 * Signed in it is a **menu button**: Profile, Settings, and a Sign out that
 * submits `signOutAction`. Signed out it is not a menu at all — a visitor with
 * no session has nothing to choose between, so the chip is a plain "Sign in"
 * link to `/login`, which is also where sign-out lands you.
 *
 * Keyboard follows the WAI-ARIA menu-button pattern rather than a dialog's: the
 * menu is not a modal, so focus is *managed* (first item on open, ↑/↓/Home/End
 * inside, Escape returns focus to the trigger) rather than hard-trapped, and
 * Tab is allowed to leave — trapping Tab in a dropdown is the thing that makes
 * one feel broken. Pointer-down outside and a route change both close it.
 *
 * `ActionForm` carries the sign-out submit, which is what makes demo mode
 * honest: there is no session to end, the action says so, and the message is
 * rendered inside the open menu instead of vanishing.
 */
export function AccountMenu({ signedIn, displayName, roleLabel, avatar }: AccountMenuProps) {
  /**
   * The route the menu was opened on, rather than a boolean.
   *
   * The shell does not remount across a navigation, so a plain `open` flag left
   * the menu hanging over the page you had just navigated to — and closing it
   * from an effect on `pathname` is a cascading render the React Compiler rules
   * in this repo reject (correctly: it is derived state). Comparing the two
   * makes "a navigation closes the menu" a consequence of rendering, not a
   * second render.
   */
  const [openedAt, setOpenedAt] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const open = openedAt !== null && openedAt === pathname;

  const close = React.useCallback((restoreFocus = false) => {
    setOpenedAt(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpenedAt(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function items(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
  }

  function focusItem(index: number) {
    const all = items();
    if (all.length === 0) return;
    const next = (index + all.length) % all.length;
    all[next]?.focus();
  }

  function openWith(index: number) {
    setOpenedAt(pathname);
    // The menu mounts in this same commit; focus after paint.
    requestAnimationFrame(() => focusItem(index));
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openWith(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWith(-1);
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const all = items();
    const current = all.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "ArrowDown":
        event.preventDefault();
        focusItem(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(-1);
        break;
      case "Tab":
        // Not a dialog: let focus move on, but do not leave a menu open behind.
        setOpenedAt(null);
        break;
      default:
        break;
    }
  }

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-[12px] py-1 pr-2.5 pl-0.5",
          "transition-colors hover:bg-white/5",
        )}
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#141c2e] text-muted ring-2 ring-[#2b3550]"
          aria-hidden="true"
        >
          <LogIn className="size-4" aria-hidden="true" />
        </span>
        <span className="hidden flex-col leading-none md:flex">
          <b className="text-[12.5px] font-extrabold">Sign in</b>
          <small className="mt-1 text-[10.5px] font-semibold text-[#5aa8ff]">Guest</small>
        </span>
        <span className="sr-only md:hidden">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        id="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "account-menu" : undefined}
        onClick={() => (open ? close() : openWith(0))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-[12px] py-1 pr-1 pl-0.5 transition-colors",
          open ? "bg-white/6" : "hover:bg-white/5",
        )}
      >
        <ChipAvatar avatar={avatar} displayName={displayName} />
        <span className="hidden flex-col leading-none md:flex">
          <b className="text-[12.5px] font-extrabold">{displayName}</b>
          <small className="mt-1 text-[10.5px] font-semibold text-[#5aa8ff]">{roleLabel}</small>
        </span>
        {/*
         * Below `md` the name and role are `display:none`, which takes them out
         * of the accessibility tree too — and the avatar is decorative. Without
         * this the trigger is a visible, focusable button announced as plain
         * "button" on every phone. The guest branch below already carries the
         * same fallback.
         */}
        <span className="sr-only md:hidden">{displayName} — account menu</span>
        <ChevronDown
          className={cn(
            "hidden size-3.5 text-[#66728a] transition-transform duration-150 md:block",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id="account-menu"
          role="menu"
          aria-labelledby="account-menu-trigger"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "animate-fade-in absolute top-[calc(100%+8px)] right-0 z-50 w-[224px]",
            "bg-card-surface rounded-[16px] border border-line p-1.5 shadow-[var(--shadow-float)]",
          )}
        >
          <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2.5">
            <ChipAvatar avatar={avatar} displayName={displayName} />
            <span className="min-w-0 leading-none">
              <b className="block truncate text-[12.5px] font-extrabold">{displayName}</b>
              <small className="mt-1 block truncate text-[10.5px] font-semibold text-muted">
                {roleLabel}
              </small>
            </span>
          </div>

          <Link
            role="menuitem"
            href="/profile"
            prefetch={false}
            onClick={() => close()}
            className={itemClasses}
          >
            <UserRound className="size-4 text-blue" aria-hidden="true" />
            Profile
          </Link>
          <Link
            role="menuitem"
            href="/settings"
            prefetch={false}
            onClick={() => close()}
            className={itemClasses}
          >
            <Settings className="size-4 text-blue" aria-hidden="true" />
            Settings
          </Link>

          <div role="separator" className="my-1.5 h-px bg-line" />

          <ActionForm
            action={signOutAction}
            className="grid gap-2"
            footer={(pending) => (
              <button
                role="menuitem"
                type="submit"
                // `aria-disabled`, not `disabled`: this button holds focus while
                // the action runs, and disabling the focused element hands focus
                // to <body>, where Escape no longer reaches the menu and the
                // dropdown cannot be closed until you click elsewhere. Signing
                // out twice is harmless; losing your place is not.
                aria-disabled={pending || undefined}
                className={cn(itemClasses, "text-[#ffb3bd] hover:text-white")}
              >
                <LogOut className="size-4" aria-hidden="true" />
                {pending ? "Signing out…" : "Sign out"}
              </button>
            )}
          >
            <span className="sr-only">Sign out of AgentDistrict</span>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
