/**
 * The two keyframes the Home scenes need that the shared token layer does not
 * ship: the Lounge presence cards' idle float and the neon signs' flicker.
 *
 * They live here rather than in `app/globals.css` because nothing outside the
 * Home dashboard uses them. `prefers-reduced-motion: reduce` is honoured by the
 * global `*` rule in `app/globals.css`, which sets `animation-duration` and
 * `animation-iteration-count` with `!important` — so these are frozen for the
 * same users as every other animation in the District, and the `--float-delay`
 * offsets below never re-introduce motion.
 */
const CSS = `
@keyframes ad-home-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7px); }
}
@keyframes ad-home-neon {
  0%, 100% { opacity: 1; }
  42% { opacity: .74; }
  45% { opacity: 1; }
  63% { opacity: .82; }
  66% { opacity: 1; }
}
.ad-float {
  animation: ad-home-float 6.5s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
  will-change: transform;
}
.ad-neon {
  animation: ad-home-neon 7s ease-in-out infinite;
  animation-delay: var(--float-delay, 0s);
}
`;

export function HomeStyles() {
  return (
    <style href="ad-home" precedence="medium">
      {CSS}
    </style>
  );
}
