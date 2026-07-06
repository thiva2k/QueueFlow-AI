# QueueFlow AI — "NIGHT TERMINAL" v4 (Tailwind + 21st.dev kit)

> Binding spec. v3 was judged **too generic** ("dark glass panels + cyan").
> v4's mandate: keep the token system and the split-flap signature, but make
> the LAYOUTS unmistakable — bento compositions, oversized numerals, and the
> civic-document motif. A reskin of v3 is a failed deliverable.

## 0. Concept (unchanged)

A public-services hall as an airport control tower at night. Cyan = live
signal. Sodium amber = the call. New this pass: the interface borrows the
physical artifacts of civic paperwork — machine-readable strips, perforation
lines, registration stamps, register ticks — rendered in terminal light.

## 1. Stack

- Tailwind v4 (via `@tailwindcss/vite`), theme mapped to the Night Terminal
  CSS vars — utilities: `bg-night bg-night-1 bg-surface bg-surface-2
  text-ink text-ink-2 text-ink-3 text-live text-amber text-ok text-danger
  border-line border-line-strong font-display font-sans font-mono` etc.
- `cn()` from `src/lib/utils.js`.
- **Page styling is Tailwind-first.** Page CSS files shrink to only what
  utilities can't express (rail geometry, print rules, complex keyframes).
- Old shared classes (.qf-btn, .qf-chip, .qf-flap, .qf-panel…) still exist
  and remain valid — mix freely.

## 2. The kit (`src/components/ui/`, barrel `ui/index.js`)

- `<BentoCard tone="live|amber">` + `<BentoGrid>` — glass tile with a
  cursor-tracking spotlight border (adapted from 21st.dev "Cybernetic Bento
  Grid"). THE standard container for v4 layouts. 12-col grid; span with
  `col-span-*` / `row-span-*`.
- `<BorderBeam size duration colorFrom colorTo reverse />` — bright gradient
  segment orbiting a card's border. ONE per page, on the primary card.
- `<Marquee duration gap reverse pauseOnHover>` — infinite ticker.
- `<NumberTicker value prefix suffix />` — spring count-up on scroll-into-view
  (hero stats only; live-updating data keeps `<AnimatedNumber />`).
- Ours, unchanged: `<SplitFlap />` (signature), `<FlowField />` (hero ambient)
  from `src/components/index.js` with StatusChip, StatCard, AnimatedNumber,
  Skeleton, EmptyState, LiveIndicator, PageHeader, ConfirmDialog, Toast.

## 3. Civic-document motif (Tailwind utilities in styles/tailwind.css)

- `qf-mrz` — machine-readable strip, e.g.
  `QF<LKA<A021<NICRENEWAL<<ARR1039<<<<` (build from real token data; this is
  ornament that encodes truth). Bottom edge of tickets/receipts.
- `qf-perf` — perforation tear-line (between ticket body and stub).
- `qf-stamp` — rotated registration seal (e.g. "REGISTERED", amber when
  called: "CALLED"). One per document, placed asymmetrically.
- `qf-ticks` — technical register marks on card corners (relative parent).
- Dotted leaders for label→value rows: `border-b border-dotted border-line`.

## 4. Layout language (what kills the generic look)

- **Bento, not stacks.** Sections compose as 12-col BentoGrids with
  deliberate asymmetry (7/5, 8/4, 2-row spans). No page may be a single
  centered column of equal-width panels (exception: /track, /display).
- **Oversized numerals.** Each page has ONE huge number moment (SplitFlap or
  display-1 mono) that anchors the composition.
- **Data ornaments.** Section headers carry mono coordinates/counters
  ("SEC 01 · LIVE", right-aligned tick marks). Ornament must encode truth
  (real counts, real times) — never lorem decoration.
- **Depth order:** page atmosphere (foundation) → BentoCards → ONE
  BorderBeam card → the numeral moment.

## 5. Motion (v3 rules stand)

280ms enters / 180ms exits / 45ms stagger; springs 380/32; transform+opacity
only; reduced-motion = static. Route transitions live in App.jsx. FlowField
heroes only. SplitFlap for token numbers, never per-second counters.

## 6. Per-page specs

### /book — CitizenBooking
Two-zone hero: left 7 cols — eyebrow, display-1 "Skip the waiting room."
(gradient on "waiting room"), sub-line, then the form inside a BentoCard
with the page's BorderBeam. Right 5 cols — "hall monitor" bento stack:
waiting-now tile (NumberTicker, live tile spotlight), avg-service + counters
tiles (2-up), next-up Marquee tile fed by real queue data the page fetches.
Below: how-it-works as three 4-col BentoCards with mono step coordinates
("01 · CHOOSE"). Success: boarding-pass ticket in the left zone — SplitFlap
lg live, QR, `qf-perf` tear line above the stub, `qf-mrz` bottom strip built
from token data, "REGISTERED" `qf-stamp` in ok-green. Contracts: testids
booking-result / token-qr / token-share-link, `.qf-ticket` print, form
validation, 6s polling.

### /token/:n — CitizenTokenStatus
The page IS a document: centered 8-col "boarding pass XL" BentoCard
(BorderBeam here) — SplitFlap lg (amber when called) + StatusChip + stamp
("WAITING" neutral / "CALLED" amber), FlowField behind, `qf-mrz` strip at
its base. Below, 12-col bento: arrival rail card (7) + countdown ring card
(5), then journey + details as 6/6. Called state flips hero temperature to
amber (calledFlash + glow). Contracts: testids token-recommended-arrival /
token-estimated-service / token-people-ahead, 4s polling, cancel + notify,
paused-copy "Estimates paused — counters are closed right now."

### /track — TokenLookup
Centered document card (BentoCard + qf-ticks), mono uppercase input, recent
chips stagger in. May stay single-column.

### /display — PublicDisplay (light touch — it already works)
Keep v3 structure. Add: BorderBeam on called/serving counter cards (amber
beam), replace the footer marquee markup with `<Marquee>`, corner `qf-ticks`
on counter cards. 6m readability floor and all testids/localStorage keys
unchanged.

### /admin — AdminDashboard
Command bento: KPI row stays; below it 12-col — "now serving" counters as
2-col-span BentoCards (SplitFlap md amber, BorderBeam on the busiest/called
card), activity feed as a right 4-col 2-row-span tile, SLA + prediction
tiles fill. Section headers get mono coordinates. All actions/gates/testids
unchanged.

### /analytics — AnalyticsInsights
Bento chart tiles (8/4, 6/6), draw-in once, `qf-ticks` corners, headline
stat as NumberTicker.

## 7. Quality floor (unchanged, non-negotiable)

375px no h-scroll; ≥44px touch targets; visible focus; ≥4.5:1 body
contrast; reduced-motion static; zero console errors; every existing
data-testid, API call, polling cadence, localStorage/sessionStorage key,
and print behavior preserved.
