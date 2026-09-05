/**
 * Keyframes the Lounge, TV and Showroom scenes need that the shared token layer
 * does not ship.
 *
 * They live in a `<style href precedence>` tag rather than `app/globals.css`
 * because nothing outside these three surfaces uses them, and React de-dupes
 * the tag by `href` however many times a page renders it.
 *
 * `prefers-reduced-motion: reduce` is honoured by the global `*` rule in
 * `app/globals.css`, which sets `animation-duration` and
 * `animation-iteration-count` with `!important` — so every keyframe below is
 * frozen for the same visitors as the rest of the District, and the
 * `--float-delay` offsets never re-introduce motion.
 */
const CSS = `
@keyframes ad-lounge-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes ad-lounge-neon {
  0%, 100% { opacity: 1; }
  42% { opacity: .72; }
  45% { opacity: 1; }
  63% { opacity: .84; }
  66% { opacity: 1; }
}
@keyframes ad-lounge-breathe {
  0%, 100% { opacity: .55; transform: scale(1); }
  50% { opacity: .95; transform: scale(1.04); }
}
@keyframes ad-lounge-talk {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-3px) rotate(-2.5deg); }
  75% { transform: translateY(-1px) rotate(2.5deg); }
}
@keyframes ad-lounge-bars {
  0%, 100% { transform: scaleY(.35); }
  50% { transform: scaleY(1); }
}
@keyframes ad-lounge-sweep {
  from { transform: translateX(-120%); }
  to { transform: translateX(320%); }
}
@keyframes ad-lounge-reveal {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.ad-lounge-float {
  animation: ad-lounge-float 6.5s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
  will-change: transform;
}
.ad-lounge-neon {
  animation: ad-lounge-neon 7s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
}
.ad-lounge-breathe {
  animation: ad-lounge-breathe 5.5s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
}
.ad-lounge-talk {
  animation: ad-lounge-talk 1.6s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
  transform-origin: 50% 100%;
}
.ad-lounge-bar {
  animation: ad-lounge-bars 1.1s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
  transform-origin: 50% 100%;
}
.ad-lounge-sweep {
  animation: ad-lounge-sweep 2.8s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
}
.ad-reveal {
  animation: ad-lounge-reveal 0.45s var(--ease-out-quart) both;
  animation-delay: var(--reveal-delay, 0s);
}
/*
 * The global reduced-motion block neutralises duration and iteration count but
 * not delay — a staged reveal would still make those visitors wait. Clear the
 * delays here so everything is simply present.
 */
@media (prefers-reduced-motion: reduce) {
  .ad-reveal,
  .ad-lounge-float,
  .ad-lounge-neon,
  .ad-lounge-breathe,
  .ad-lounge-talk,
  .ad-lounge-bar,
  .ad-lounge-sweep {
    animation-delay: 0s !important;
  }
}
`;

export function LoungeStyles() {
  return (
    <style href="ad-lounge" precedence="medium">
      {CSS}
    </style>
  );
}
