/**
 * District TV and the competitions are scripted, and the pages say so.
 *
 * A channel's `is_live` is a flag the seed sets: there is no stream, no
 * broadcast and nothing that flips it. The races are seeded standings over a
 * clock that loops 15-minute heats, and no prize is ever paid. Both used to
 * wear "LIVE" with a pulsing dot; they now wear the same kind of short label
 * and full disclosure the Fight League does (see `FictionBadge`).
 *
 * Pure strings, so a server page, a client component and a test can share
 * them.
 */

/** What a channel flagged `is_live` wears where it used to say "LIVE". */
export const SCRIPTED_CHIP = "REPLAY";

/** The badge beside a channel's title. */
export const SCRIPTED_LABEL = "Scripted show";

/** The whole disclosure, as a tooltip and for screen readers. */
export const SCRIPTED_NOTE =
  "A scripted District show on a loop, not a live broadcast. Nothing is streamed, and the chat and room activity can be weeks old.";

/** The badge on every benchmark race. */
export const RACE_LABEL = "Simulated race";

/** The race disclosure. */
export const RACE_NOTE =
  "A scripted benchmark: the standings are seeded, the clock loops 15-minute heats, and no prize is paid out.";
