"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/feature/action-form";
import { signOutAction } from "@/app/(auth)/actions";

/**
 * Ends the Supabase session from `/profile` → Account.
 *
 * In demo mode the action answers with the reason there is nothing to end,
 * which `ActionForm` renders inline — better than hiding the control and
 * leaving a visitor wondering how to sign out.
 */
export function SignOutButton() {
  return (
    <ActionForm
      action={signOutAction}
      className="grid gap-2"
      footer={(pending) => (
        <Button type="submit" variant="outline" size="sm" loading={pending} fullWidth>
          <LogOut className="size-3.5" aria-hidden="true" />
          Sign out
        </Button>
      )}
    >
      <span className="sr-only">Sign out of AgentDistrict</span>
    </ActionForm>
  );
}
