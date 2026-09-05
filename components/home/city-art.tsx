import * as React from "react";

/**
 * Deterministic city art shared by the Home hero and the Lounge window.
 *
 * Every window is placed by a pure hash of the tower index — no `Math.random()`
 * during render, so screenshots and the e2e suite stay byte-stable.
 */

export type Tower = {
  x: number;
  w: number;
  h: number;
  seed: number;
  /** Antenna height on top of the tower, in viewBox units. */
  spire?: number;
};

export const GROUND = 200;

const PITCH_X = 5.5;
const PITCH_Y = 6.5;
const WIN_W = 2.6;
const WIN_H = 3.4;

/** Back layer — tall, cool, hazy. */
export const FAR_TOWERS: Tower[] = [
  { x: 14, w: 30, h: 63, seed: 1 },
  { x: 48, w: 22, h: 92, seed: 2, spire: 12 },
  { x: 74, w: 36, h: 75, seed: 3 },
  { x: 114, w: 26, h: 108, seed: 4, spire: 16 },
  { x: 144, w: 40, h: 84, seed: 5 },
  { x: 188, w: 24, h: 102, seed: 6 },
  { x: 216, w: 34, h: 69, seed: 7 },
  { x: 254, w: 28, h: 96, seed: 8, spire: 10 },
  { x: 286, w: 38, h: 79, seed: 9 },
  { x: 328, w: 22, h: 107, seed: 10 },
  { x: 354, w: 32, h: 66, seed: 11 },
  { x: 390, w: 26, h: 99, seed: 12, spire: 13 },
  { x: 420, w: 36, h: 76, seed: 13 },
  { x: 460, w: 30, h: 91, seed: 14 },
];

/** Front layer — shorter, warmer, darker. */
export const NEAR_TOWERS: Tower[] = [
  { x: -6, w: 44, h: 50, seed: 21 },
  { x: 42, w: 32, h: 72, seed: 22 },
  { x: 96, w: 48, h: 58, seed: 23 },
  { x: 168, w: 36, h: 82, seed: 24 },
  { x: 228, w: 54, h: 53, seed: 25 },
  { x: 306, w: 34, h: 75, seed: 26 },
  { x: 358, w: 50, h: 60, seed: 27 },
  { x: 424, w: 30, h: 79, seed: 28 },
  { x: 470, w: 42, h: 55, seed: 29 },
];

function Windows({ tower, fill }: { tower: Tower; fill: string }) {
  const cols = Math.max(1, Math.floor((tower.w - 4) / PITCH_X));
  const rows = Math.max(1, Math.floor((tower.h - 8) / PITCH_Y));
  const left = tower.x + (tower.w - (cols - 1) * PITCH_X - WIN_W) / 2;
  const top = GROUND - tower.h + 5;

  const cells: React.ReactElement[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // Pure pseudo-randomness: ~62% of windows are lit.
      if ((r * 7 + c * 13 + tower.seed * 5) % 8 < 3) continue;
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={left + c * PITCH_X}
          y={top + r * PITCH_Y}
          width={WIN_W}
          height={WIN_H}
          fill={fill}
        />,
      );
    }
  }
  return <g opacity="0.85">{cells}</g>;
}

export function Skyline({
  towers,
  fill,
  glass,
}: {
  towers: Tower[];
  fill: string;
  glass: string;
}) {
  return (
    <g>
      {towers.map((tower) => (
        <g key={`${tower.x}-${tower.seed}`}>
          {tower.spire ? (
            <rect
              x={tower.x + tower.w / 2 - 0.6}
              y={GROUND - tower.h - tower.spire}
              width={1.2}
              height={tower.spire}
              fill={fill}
            />
          ) : null}
          <rect
            x={tower.x}
            y={GROUND - tower.h}
            width={tower.w}
            height={tower.h}
            fill={fill}
          />
          <Windows tower={tower} fill={glass} />
        </g>
      ))}
    </g>
  );
}

/**
 * The view through the Lounge's window wall: a dusk skyline seen from a
 * rooftop lounge. `idPrefix` keeps the gradient ids unique when the art is
 * rendered more than once on a page.
 */
export function CityWindowArt({
  className,
  idPrefix,
}: {
  className?: string;
  idPrefix: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="60 96 380 104"
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <defs>
        <linearGradient id={`${idPrefix}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2154" />
          <stop offset="0.55" stopColor="#3a2b6d" />
          <stop offset="1" stopColor="#6d3d6b" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#39407e" />
          <stop offset="1" stopColor="#1b2044" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-near`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2142" />
          <stop offset="1" stopColor="#0b1024" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="500" height="200" fill={`url(#${idPrefix}-sky)`} />
      <Skyline towers={FAR_TOWERS} fill={`url(#${idPrefix}-far)`} glass="#9ec8ff" />
      <Skyline towers={NEAR_TOWERS} fill={`url(#${idPrefix}-near)`} glass="#ffcf8a" />
    </svg>
  );
}

/** The brand "A" mark, used by the hero billboard and the Lounge neon sign. */
export function BrandGlyph({
  className,
  color = "#8ec9ff",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke={color}
      strokeWidth="3.4"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M24 6 L41 42 L34.5 42 L24 19 L13.5 42 L7 42 Z" />
      <path d="M24 24 L24 36" strokeWidth="3" />
      <path d="M20 29 L24 24 L28 29" strokeWidth="3" />
    </svg>
  );
}
