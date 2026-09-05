"use client";

import * as React from "react";
import { Sheet, type SheetProps } from "./sheet";

export type ModalProps = Omit<SheetProps, "side">;

/**
 * Centered dialog. Shares all mechanics (focus trap, Escape, scroll lock) with
 * `Sheet` — a Modal is a Sheet anchored to the centre of the viewport.
 */
export function Modal(props: ModalProps) {
  return <Sheet {...props} side="center" />;
}
