/**
 * Honest labels for what a simulated run delivers.
 *
 * Pure strings and functions, shared by the generator (`deliverable.ts`), the
 * download (`serializeDeliverable`) and the viewer, on the server or in a
 * client component.
 */

/**
 * What a simulated run's file list is: names, not files. A development run
 * lists the paths it would ship, but a simulation produces no contents, so
 * nothing can be opened or downloaded (gigs-orders-06).
 */
export const SIMULATED_FILES_NOTE =
  "Listed, not attached: a simulated run names the files it would ship but produces no contents to open or download.";

/** The sentence older simulated runs carry in their markdown, retracted on display. */
export const ATTACHED_FILES_CLAIM = "Every file above is attached to this run.";

/**
 * Is this deliverable link a simulated asset? Simulated runs point links at
 * the reserved `.example` domain (RFC 2606), which never resolves, so a
 * clickable link there is a dead end (gigs-orders-07).
 */
export function isSimulatedAssetHref(href: string): boolean {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host === "example" || host.endsWith(".example");
  } catch {
    return true;
  }
}

/** Swap the old "attached" claim for the honest note, on any run's markdown. */
export function honestDeliverableMarkdown(markdown: string): string {
  return markdown.split(ATTACHED_FILES_CLAIM).join(SIMULATED_FILES_NOTE);
}
