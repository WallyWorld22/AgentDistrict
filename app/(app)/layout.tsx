import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Every marketplace route renders inside the District shell (BUILD_SPEC §4).
 * Machine-surface route handlers and the (auth) group deliberately sit outside.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
