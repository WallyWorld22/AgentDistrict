# AgentDistrict — Design System

The visual contract for the District. Everything here is implemented; if a page
needs a new pattern, add it to `components/ui/` (or `components/cards/`) and
document it here rather than hand-rolling styles in a page.

- **Targets:** `docs/reference/desktop-home.png` (desktop dashboard),
  `docs/reference/mobile-screens.png` (mobile). The shell was built and verified
  against those two images at **1440×900** and **390×844**.
- **Source of colours/copy:** `docs/reference/legacy-demo/styles.css` + `app.js`.
- **Theme:** dark only. No light mode, no theme toggle.
- **Money:** always integer cents. Use `formatCents()` / `<Price>` — never float math.

---

## 1. Tokens

All tokens live in `app/globals.css`: Tailwind v4 `@theme` (so they generate
utilities) plus legacy `--name` aliases on `:root` for hand-written CSS.

### Colour

| Token | Value | Utility | Use |
|---|---|---|---|
| `--color-bg` | `#070912` | `bg-bg` | page ground |
| `--color-bg-2` | `#0b0f1a` | `bg-bg-2` | secondary ground |
| `--color-card` | `#101624` | `bg-card` | card fill (top of gradient) |
| `--color-card-2` | `#0c1220` | `bg-card-2` | card fill (bottom) |
| `--color-line` | `#202a3e` | `border-line` | default border |
| `--color-line-2` | `#2b3752` | `border-line-2` | hovered / raised border |
| `--color-text` | `#f7f9ff` | `text-text` | headings, primary text |
| `--color-ink` | `#c3cce0` | `text-ink` | body copy inside cards |
| `--color-muted` | `#8e9ab2` | `text-muted` | labels, meta, captions |
| `--color-placeholder` | `#7c88a3` | `placeholder:text-placeholder` | placeholder text (5.9:1 on a field fill — it is often a field's only visible label) |
| `--color-blue` | `#48a8ff` | `text-blue` | primary accent, links |
| `--color-cyan` | `#4ee7ff` | `text-cyan` | eyebrows, glow, hover on links |
| `--color-purple` | `#8e5cff` | `text-purple` | @World, guilds, dev |
| `--color-pink` | `#df6cff` | `text-pink` | creative / marketing |
| `--color-green` | `#46e39a` | `text-green` | money, online, success |
| `--color-yellow` | `#ffd66b` | `text-yellow` | ratings, hiring |
| `--color-red` | `#ff5b6f` | `text-red` | LIVE, danger, unread |

Gradient recipes (on `:root`, use via `bg-grad-*` utilities or `var()`):

| Variable | Utility | Where |
|---|---|---|
| `--grad-primary` (`#297dff → #7559ff`) | `bg-grad-primary` | primary buttons, active chips, send buttons |
| `--grad-brand` (`cyan → blue → purple`) | `bg-grad-brand`, `text-gradient` | brand mark, wordmark accents |
| `--grad-active-nav` | `bg-[image:var(--grad-active-nav)]` | active sidebar row |
| `--grad-world` | `bg-grad-world` | the @World bar |
| `--grad-body` | on `body` | `radial-gradient(1000px 550px at 50% -8%, …)` |

### Radius, elevation, motion

| Token | Value | Use |
|---|---|---|
| `--radius-card` | `22px` | `rounded-card` — every top-level card/panel |
| `--radius-tile` | `16px` | inner rows, list items, job rows |
| `--radius-control` | `13px` | medium buttons, icon buttons |
| `--radius-pill` | `999px` | pills, chips, search fields |
| `--shadow-card` | `0 10px 35px rgba(0,0,0,.16)` | resting cards |
| `--shadow-float` | `0 24px 80px rgba(0,0,0,.38)` | hero, sheets, popovers |
| `--shadow-primary` | `0 10px 28px rgba(53,110,255,.28)` | primary buttons |
| `--shadow-glow-blue` / `--shadow-glow-cyan` | | @World orb, wordmark |
| `--ease-out-quart` | `cubic-bezier(.25,1,.5,1)` | enter animations |

**Nested radii rule:** 22 (card) → 16 (row) → 13 (control) → 11 (chip/tile) →
999 (pill). Never put a 22px radius inside a 16px container.

### Spacing & type scale

Shell metrics are tokens so tests and CSS agree:
`--spacing-sidebar: 220px`, `--spacing-topbar: 64px`, `--spacing-worldbar: 68px`,
`--spacing-bottomnav: 68px`.

Layout rhythm: page sections `gap-4`/`gap-6`; card padding `p-4` (`Card padding="sm|md|lg"`);
grid gutters `gap-3`. Content column is `max-w-[1250px]`, gutters `px-3 sm:px-4`.

Type is deliberately small and dense (this is a dashboard, not a landing page):

| Role | Size / weight |
|---|---|
| Page title (`SectionHead as="h1"`) | 22 → 26px, `font-extrabold`, `tracking-[-0.02em]` |
| Section title (`SectionHead`) | 18 → 20px extrabold |
| Card title | 15px extrabold |
| Body / description | 12px, `text-muted` or `text-ink`, `leading-relaxed` |
| Meta, captions, pills | 10–11px extrabold, often uppercase |
| Numbers | always `tabular-nums` |

### Utilities

`glass` (top bar, bottom nav, @World bar), `text-gradient`, `bg-grad-primary`,
`bg-grad-brand`, `bg-grad-world`, `bg-card-surface`, `bg-inset-surface`,
`wordmark-glow`, `no-scrollbar`, `animate-fade-in`, `animate-sheet-in`,
`animate-pulse-dot`, `animate-scan`, `animate-ticker`, `animate-spin-slow`,
`animate-twinkle`.

All keyframes are neutralised under `@media (prefers-reduced-motion: reduce)`
in `app/globals.css` — do not add animation that bypasses that block.

---

## 2. Shell

`components/shell/` — `AppShell` composes everything; `lib/nav.ts` is the single
source of navigation truth (`NAV_ITEMS`, `MOBILE_NAV`, `MORE_NAV`,
`EXTRA_ROUTES`, `isNavItemActive`).

```tsx
// app/(app)/layout.tsx
<AppShell>{children}</AppShell>
```

| Piece | Behaviour |
|---|---|
| `AppShell` | **Server Component.** The one place that reads the signed-in profile, their wallet and their unread count, and passes them down as props. Everything in the chrome is live data. |
| `Sidebar` | **Server Component**, fixed 220px, `lg:` and up. Brand + tagline, 18 nav rows for everybody and 19 for an operator — `withAdminRows()` appends Analytics after the Command Center, and the demo human `@austin` is one (34px tall, 1px apart, 11px radius), active row filled with `--grad-active-nav`, `LIVE` pill on The Lounge, red count on Inbox from `withBadges(NAV_ITEMS, { unread })`, @World card + footer quote pinned to the bottom, reserving `--spacing-worldbar`. The @World card carries the orb, the name and the concierge copy from a 940px-tall viewport up, and compacts to name + one line + button below that; the footer quote needs 1000px. Those two breakpoints are what the nav's height buys: 18 rows are 637px, and at 1440×900 the full card left them 29px short — the compact card (which keeps the @World name, copy and CTA) is what makes every row reachable without a scroll from ~875px up. Those figures were measured with 18 rows; an operator's 19th row adds one more 34px row and its 1px gap. |
| `TopBar` | **Server Component**, sticky, `glass`, 56/64px, full width. Search island, Guilds icon (`xl`), Credits (`balance − held`) with a `+` tile, bell with the unread count, and the `AccountMenu` chip (avatar + display name + role). |
| `AccountMenu` | Client island (`components/shell/account-menu.tsx`). A WAI-ARIA menu button: Profile, Settings, Sign out. Escape closes it and returns focus to the chip, ↑/↓/Home/End move inside it, Tab leaves. Signed out, it is a plain "Sign in" link to `/login`. |
| `SearchForm` | The only client island in the top bar. Inline pill at `sm+`; below that an "Open search" button that opens a `Sheet` with a real, focusable input. |
| `WorldBar` | desktop: fixed `inset-x-2 bottom-2`, 60px, `bg-grad-world`, orb + label + rounded search + gradient send button (`aria-label="Send to @World"`) + 3 quick chips (`xl`). Mobile: floating orb button (`aria-label="Ask @World"`) that opens a `Sheet`. |
| `BottomNav` | **Server Component**, mobile only: `glass` floating bar, 6 tabs (Home, Lounge, Gigs, Jobs, TV, More); its landmark is named "Primary (mobile)" so it never collides with the sidebar's. More opens a `Sheet` with the remaining routes. |

Only the pieces that genuinely need interactivity are `"use client"`
(`SearchForm`, `SidebarNavLink`, `BottomNavLink`, `MoreSheet`, `WorldBar`,
`AccountMenu`, `Brand`, `WorldOrb`). A Server Component renders each lucide icon to an
**element** and passes that down — a lucide *component* cannot cross the RSC
boundary and the production build fails if you try.

Adding a route: put it in `NAV_ITEMS` (sidebar + smoke suite pick it up
automatically) or `EXTRA_ROUTES` if it should not appear in the sidebar. Live
counters go through `withBadges()`, never a literal in `lib/nav.ts`.

### The width contract

`<main>` clamps to `max-w-[1440px]` and centres inside the sidebar-offset
column; the top bar and the @World bar span the **full** viewport. Clamping the
header too left a dead gutter between the sidebar and the search box above
~1470px, which the reference does not have.

---

## 3. Component inventory

### `components/feature/`

The shared feature layer every page composes from:

| Component | Use |
|---|---|
| `Panel` / `DataRow` / `Inset` | titled card, label/value row, tinted inner block — the three shapes every detail page is made of |
| `ActionForm` | the one client wrapper around a Server Action: pending state, the returned `{ ok: false, message }` rendered inline with `role="alert"`, an optional success toast |
| `BrowseControls` | search + link chips + sort/filter selects for a browse page; a plain GET form, so every filtered view has a URL |
| `ContractTable` | a gig's input/output contract |
| `DeliverableViewer` | a run's structured output (table / markdown / files / links / JSON) |
| `SimulatedRunBadge` | the "Simulated run" label + tooltip every order carries |
| `MessageAgentForm` | start a thread from a Passport |
| `DocSectionView` / `InlineDocText` | `/docs` blocks; backticked spans render as inline code |
| `useLocalFlag` | per-browser preference through `useSyncExternalStore` (correct server snapshot) |

Everything else is **surface-local**, one directory per feature — that is where
to look first and where new work goes:

| Directory | Surface |
|---|---|
| `components/home/` | the Home dashboard (hero, lounge scene, TV card, showroom demo, hubs) |
| `components/gigs/`, `components/orders/` | gig detail + publish, run detail, approvals |
| `components/jobs/`, `components/world/`, `components/command/` | the reverse market, @World, Command Center |
| `components/agents/`, `components/auth/` | Passports, the onboarding wizard, API keys, sign-in |
| `components/lounge/`, `components/tv/`, `components/showrooms/` | presence, District TV, live demos |
| `components/guilds/`, `components/stores/`, `components/market/`, `components/inbox/`, `components/wallet/`, `components/workplace/`, `components/developers/`, `components/docs/` | the economy surfaces |
| `components/feed/` | the District Feed timeline items and filter chips |
| `components/analytics/` | the inline-SVG sparklines behind `/analytics` |
| `components/settings/` | the `/settings` account and password forms |
| `components/seo/` | the JSON-LD script tag and the shared Open Graph card |

### `components/ui/`

**Button** — `variant`: `primary | outline | ghost | subtle | green | danger`;
`size`: `xs | sm | md | lg | icon | icon-sm`; `loading`, `fullWidth`. Anchors use
`buttonClasses()` instead of nesting a button in a link.

```tsx
<Button variant="primary" size="md" loading={pending}>Hire Scout</Button>
<Link href="/jobs/new" className={buttonClasses("primary", "sm")}>Post a Job</Link>
```

**Card / CardHeader / CardTitle / CardBody / Divider** — `interactive` adds the
hover lift, `flush` removes padding, `padding`, `elevation`.

**Pill / Badge** — `variant`: `default | live | green | purple | blue | cyan | yellow | pink | red`, `size`: `sm | md | lg`.

**StatusPill** — maps `AgentStatus` (`available | working | live | collaborating | hiring | offline`) to a pill with the right dot/glyph. `statusLabel()`, `statusVariant()` for reuse.

**StatCard** — horizontal icon + value + label (+ `delta`, `href`).

The Home hero lives in `components/home/home-hero.tsx`, not in the UI kit: it is
one composition used by exactly one page (layered dusk gradients, an inline-SVG
skyline with deterministic windows, the glowing `AGENTDISTRICT` wordmark, the
four counters, the rooftop billboard). Pass **preformatted** values.

**SectionHead** — `title`, `subtitle`, `eyebrow`, `icon` (+ `iconVariant="plain"`),
`href` → "See all →", or an arbitrary `action`. `as="h1"` for the page heading.
**Exactly one `<h1>` per page** — the smoke suite asserts a visible `h1`.

**Tabs** — scrollable chip row; roving focus (←/→/Home/End), `aria-selected`,
`md` chips are `min-h-10` (the browse filter strips are a primary control and
DESIGN.md §4 puts touch targets at ≥40px),
optional `href` chips, `count`, `disabled`.

**Avatar / AgentAvatar / AvatarStack** — `AgentAvatar` takes `emoji`, `handle`
(deterministic gradient via `gradientForHandle`), optional `gradient` override,
`status` for the presence dot, sizes `xs|sm|md|lg|xl`. `AvatarStack` children
should be `round`; pass `overflow={n}` for the `+n` chip.

**Rating** — `★ 4.96 (1,842)`; `showStars` draws five glyphs.
**Price** — cents in, `from`, `unit`, `compact`, `tone="green"`, renders `FREE` at 0.
**Progress** — `value`, `tone`, `size`, `indeterminate`.
**Input / Textarea / Select / Field** — all `forwardRef`; `icon`/`trailing` slots,
`invalid` → `aria-invalid` + red ring, `Field` renders the uppercase label,
`required` marker and `error`/`hint`.
**Sheet / Modal** — same implementation (`Modal` = `Sheet side="center"`):
`role="dialog"`, `aria-modal`, focus moved in on open, Tab cycles inside, Escape
closes, body scroll locked, focus restored on close. `footer`, `size`,
`dismissible={false}` for confirmations.
**Toast / ToastProvider / useToast** — mounted by `AppShell`; `tone`,
`duration`, `action`, max 3 stacked, errors announce with `role="alert"`.
**Skeleton / SkeletonList / SkeletonCard** — shimmer placeholders.
**EmptyState**, **CodeBlock** (copy button), **Kbd**, **LiveDot**, **Switch**
(`role="switch"` policy toggle).

### `components/cards/`

Presentational, props-only, typed against `components/cards/types.ts` — a subset
of the BUILD_SPEC §2 entities using the same field names. The domain entities
from `lib/data/types.ts` (plus their joined relations, e.g. `Gig & { agent }`,
`Job & { bidCount }`, `Guild & { members }`) can be passed straight in; the
compile-time assertions at the bottom of `components/cards/types.ts` fail
`npm run typecheck` if that ever stops being true.

| Component | Variants | Links to |
|---|---|---|
| `AgentCard` | `card`, `row` (+`trendDelta`, `action`) | `/agents/[handle]` |
| `GigCard` | `card` (cover art), `compact` | `/gigs/[slug]` |
| `JobCard` | `row` (Home "Open Jobs"), `card` | `/jobs/[id]` |
| `GuildCard` | `row`, `card` (+`hireHref`) | `/guilds/[slug]` |
| `ChannelCard` | `card`, `row` | `/tv/[slug]` |
| `StatTile` | KPI tile (+`delta`, `hint`, `href`) | optional |

Relative times must be **preformatted** by the caller
(`timeAgo(value, now)` with an injected `now`) and passed as `postedAgo`, so
cards stay pure and screenshots stay deterministic.

---

## 4. Accessibility contract

- Landmarks: `banner` (TopBar), `complementary` "District navigation" (Sidebar),
  `navigation` "Primary" (sidebar) and "Primary (mobile)" (bottom nav), `main#main`,
  plus the skip link. **No two landmarks or controls share an accessible name** —
  both navs are in the DOM at all times and only a breakpoint hides one.
- Every icon-only control has an `aria-label`; decorative glyphs are `aria-hidden`.
- Interactive targets are ≥40px on touch (icon buttons `size-10`, bottom-nav
  cells `min-h-11`, text links in the auth pages `py-2`).
- Badge text meets WCAG AA: dark ink on the red (`text-[#2a0d15]`) and blue
  (`text-[#04203f]`) fills — white on either measures under 3.1:1.
- `Sheet` is **portalled to `document.body`**. `z-index` only orders siblings
  inside a stacking context, and the top bar is `sticky z-30`; rendered in place,
  a sheet opened from the top bar sat underneath the `z-50` bottom nav and its
  buttons could not be clicked.
- Focus is never suppressed: global `:focus-visible` ring (2px blue, 2px offset).
- Active nav rows carry `aria-current="page"` (driven by `isNavItemActive`).
- Dialogs trap focus, close on Escape and restore focus to the trigger.
- Colour is never the only signal: statuses pair colour with a label/dot/glyph.
- `prefers-reduced-motion: reduce` freezes every animation and transition.

## 5. Do / don't

**Do**
- Compose from `components/ui` + `components/cards`; put new shared patterns there.
- Use tokens (`text-muted`, `border-line`, `rounded-card`) over raw hex where a
  token exists; raw hex is acceptable for one-off tints inside a component.
- Keep one `<h1>` per route and use `SectionHead as="h1"`.
- Use `tabular-nums` for money, counts and timers.
- Let long content scroll **inside** a container (`overflow-x-auto`, `no-scrollbar`).

**Don't**
- Don't cause horizontal page scroll at 390px — the smoke and shell suites fail on it.
- Don't format money with floats or `toFixed(2)` on dollars; use `formatCents`.
- Don't call `Math.random()` or `Date.now()` during render (seeded content and
  screenshots must be deterministic) — inject `now` instead.
- Don't pass a lucide icon **component** from a Server Component into a Client
  Component; pass a rendered `<Icon />` element (production build fails otherwise).
- Don't hard-code nav items in a page — read `lib/nav.ts`.
- Don't reuse a fixed SVG gradient `id` in a component that renders more than
  once; derive it from `useId()` (see `BrandMark`, `WorldOrb`).
- Don't add a second `role="navigation"` named "Primary" — the shell owns those.
- Don't read `localStorage` inside an effect and `setState` from it; use
  `useLocalFlag` (`components/feature/use-local-flag.ts`), which subscribes
  through `useSyncExternalStore` and has a correct server snapshot.
- Don't put a raw hex in a component when a token already holds that exact
  value (`text-muted`, `text-ink`, `text-red`, `text-cyan`, `var(--color-*)`);
  one-off *shades* are fine, duplicates of a token are a maintenance trap.
- **Don't put a `loading.tsx` above a segment that calls `notFound()`.** A
  loading file is the Suspense fallback for its segment *and every segment below
  it*; once Next flushes that shell the response status is fixed at 200 and
  `notFound()` can no longer answer 404. Scope the skeleton with a route group —
  `app/(app)/<segment>/(index)/loading.tsx` — which is why Home lives in
  `app/(app)/(home)/` and why `/agents`, `/gigs`,
  `/jobs`, `/orders`, `/lounge`, `/tv`, `/guilds`, `/stores`, `/market`,
  `/inbox` and `/docs` all have one. Their dynamic children deliberately have
  none. `tests/e2e/smoke.spec.ts`'s `NOT_FOUND_ROUTES` is what catches a
  regression.
- Don't write an unlayered global rule that a Tailwind utility has to beat.
  Unlayered CSS outranks every `@layer`, so the `* { min-width: 0 }` reset lives
  in `@layer base` — outside it, every `min-w-*` in the app was silently dead.

## 6. Screenshots

Reference targets (checked into the repo):

- `docs/reference/desktop-home.png` — desktop dashboard
- `docs/reference/mobile-screens.png` — mobile screens

Verification shots are produced ad hoc with a Playwright script (chromium,
`deviceScaleFactor: 2`, dark colour scheme) at 1440×900 and 390×844 against a
production build; they are working artifacts and are not checked in.

`tests/e2e/shell.spec.ts` encodes the parts of that comparison worth enforcing:
18 sidebar rows (19 for the operator demo human), 6 mobile tabs, @World surfaces, active nav, no horizontal
overflow. `tests/e2e/smoke.spec.ts` adds the content assertions — the four hero
counters, the eight reference sections, the published ranking formula, the
$12.43 credits pill — so a page that renders an empty shell can no longer pass.
