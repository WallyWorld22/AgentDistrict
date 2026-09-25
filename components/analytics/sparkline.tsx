import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 14-day sparklines for `/analytics`, as inline SVG.
 *
 * No chart library and no new colour: every stroke is a design token from
 * `app/globals.css`, which is what keeps the dashboard looking like the rest of
 * the District rather than like a widget bolted onto it.
 *
 * Rules followed here, in the order they matter:
 *
 *  - **one series, one colour.** A second series only appears where the
 *    comparison *is* the point (registrations vs claims), and then it brings a
 *    legend and both end values as direct labels, so identity is never carried
 *    by colour alone;
 *  - **one axis.** Both series of a pair are the same unit (counts) on one
 *    scale. Money gets its own card rather than a second y-axis;
 *  - **zero baseline, always.** These are counts and volumes; a floating
 *    baseline would turn a quiet fortnight into a cliff;
 *  - **thin marks, recessive chrome.** A 2px line, a hairline baseline, a 10%
 *    fill, and no gridlines — a sparkline that needs a grid wants to be a chart;
 *  - **the value is text, not a label on the plot.** Each card prints its
 *    current value in ink, and the whole series is available as a table for
 *    anyone who needs the numbers (or cannot see the plot at all).
 *
 * The plot is stretched with `preserveAspectRatio="none"` so it fills whatever
 * card it lands in; `vector-effect="non-scaling-stroke"` keeps the line 2px at
 * any width, and the end-point marker is an HTML dot positioned in percent
 * rather than an SVG circle, which that stretch would have turned into an
 * ellipse.
 */

const VIEW_W = 240;
const VIEW_H = 56;
const PAD = 4;

export type SparkTone = "blue" | "purple" | "green" | "cyan";

const TONE_VAR: Record<SparkTone, string> = {
  blue: "var(--color-blue)",
  purple: "var(--color-purple)",
  green: "var(--color-green)",
  cyan: "var(--color-cyan)",
};

export type SparkSeries = {
  label: string;
  values: number[];
  tone: SparkTone;
  /** Already formatted — "12" or "$24.80". */
  currentLabel: string;
};

type Geometry = { line: string; area: string; endX: number; endY: number };

function geometry(values: number[], max: number): Geometry {
  const n = values.length;
  const span = VIEW_W - PAD * 2;
  const height = VIEW_H - PAD * 2;
  const baseline = VIEW_H - PAD;

  const x = (index: number) => (n <= 1 ? PAD + span / 2 : PAD + (index * span) / (n - 1));
  const y = (value: number) => baseline - (max <= 0 ? 0 : (value / max) * height);

  const points = values.map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`);
  const line = `M${points.join("L")}`;
  const area = `M${x(0).toFixed(2)},${baseline} L${points.join("L")} L${x(n - 1).toFixed(2)},${baseline} Z`;

  return {
    line,
    area,
    // Percentages for the HTML marker: the SVG is stretched, the dot is not.
    endX: (x(n - 1) / VIEW_W) * 100,
    endY: (y(values[n - 1] ?? 0) / VIEW_H) * 100,
  };
}

/**
 * The plot itself. `aria-hidden` on purpose — the accessible name, the current
 * value and the full series all live in the surrounding card, where a screen
 * reader gets them as text instead of as a shape.
 */
function Plot({ series, max }: { series: SparkSeries[]; max: number }) {
  return (
    <div className="relative h-14 w-full" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-14 w-full overflow-visible"
        focusable="false"
      >
        <line
          x1={PAD}
          y1={VIEW_H - PAD}
          x2={VIEW_W - PAD}
          y2={VIEW_H - PAD}
          stroke="var(--color-line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {series.map((entry) => {
          const { line, area } = geometry(entry.values, max);
          return (
            <React.Fragment key={entry.label}>
              <path d={area} fill={TONE_VAR[entry.tone]} fillOpacity={0.1} />
              <path
                d={line}
                fill="none"
                stroke={TONE_VAR[entry.tone]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </React.Fragment>
          );
        })}
      </svg>

      {series.map((entry) => {
        const { endX, endY } = geometry(entry.values, max);
        return (
          <span
            key={entry.label}
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--color-card)]"
            style={{
              left: `${endX}%`,
              top: `${endY}%`,
              backgroundColor: TONE_VAR[entry.tone],
            }}
          />
        );
      })}
    </div>
  );
}

/** The numbers behind the plot, for anyone who needs them rather than the shape. */
function SeriesTable({
  dates,
  series,
  format,
}: {
  dates: string[];
  series: SparkSeries[];
  format: (value: number) => string;
}) {
  return (
    <details className="mt-2 border-t border-[#161f30] pt-2">
      <summary className="cursor-pointer text-[10.5px] font-extrabold text-muted hover:text-ink">
        Show the 14 days
      </summary>
      <div className="mt-2 max-h-[220px] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className="py-1 text-[10px] font-extrabold text-muted uppercase">
                Date
              </th>
              {series.map((entry) => (
                <th
                  key={entry.label}
                  scope="col"
                  className="py-1 text-right text-[10px] font-extrabold text-muted uppercase"
                >
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date, index) => (
              <tr key={date} className="border-t border-[#161f30]">
                <th
                  scope="row"
                  className="py-1 text-[11px] font-semibold text-muted tabular-nums"
                >
                  {date}
                </th>
                {series.map((entry) => (
                  <td
                    key={entry.label}
                    className="py-1 text-right text-[11px] font-bold text-ink tabular-nums"
                  >
                    {format(entry.values[index] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export type SparklineCardProps = {
  title: string;
  /** One line on what the series counts. */
  hint?: string;
  dates: string[];
  series: SparkSeries[];
  /** Formats a table cell; defaults to a plain number. */
  format?: (value: number) => string;
  className?: string;
};

/**
 * One card: title, current value(s), the plot, and the table behind it.
 *
 * A single-series card needs no legend — the title names it. Two series get
 * one, plus both current values in their own colour-neutral ink beside a
 * coloured dot.
 */
export function SparklineCard({
  title,
  hint,
  dates,
  series,
  format = (value) => value.toLocaleString("en-US"),
  className,
}: SparklineCardProps) {
  const max = Math.max(1, ...series.flatMap((entry) => entry.values));
  const summary = series
    .map((entry) =>
      series.length > 1
        ? `${entry.label} ${entry.currentLabel}`
        : `${entry.currentLabel} today`,
    )
    .join(", ");

  return (
    <section
      className={cn(
        "bg-card-surface rounded-card border border-line p-3.5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-[12.5px] font-extrabold">{title}</b>
          {hint ? <small className="mt-0.5 block text-[10.5px] text-muted">{hint}</small> : null}
        </div>
        <div className="grid shrink-0 justify-items-end gap-0.5">
          {series.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5 leading-none">
              {series.length > 1 ? (
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: TONE_VAR[entry.tone] }}
                  aria-hidden="true"
                />
              ) : null}
              <b className="text-[15px] font-extrabold tabular-nums">{entry.currentLabel}</b>
            </span>
          ))}
        </div>
      </div>

      {/*
       * The accessible name carries what the picture carries: what it is, how
       * long it runs and where it ends. `role="img"` with a label rather than a
       * chart of unlabelled nodes.
       */}
      <div className="mt-2.5" role="img" aria-label={`${title}, last 14 days. ${summary}.`}>
        <Plot series={series} max={max} />
      </div>

      {series.length > 1 ? (
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-3 p-0">
          {series.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: TONE_VAR[entry.tone] }}
                aria-hidden="true"
              />
              <small className="text-[10.5px] font-bold text-muted">{entry.label}</small>
            </li>
          ))}
        </ul>
      ) : null}

      <SeriesTable dates={dates} series={series} format={format} />
    </section>
  );
}
