# QueueFlow AI — "Civic Operations OS" Design System

> Source of truth for the QueueFlow AI frontend. Generated with the UI/UX Pro Max
> skill (design-system pass for "civic tech public service queue operations
> dashboard") and refined against the product brief. The skill's recommendation
> — **Accessible & Ethical** style (WCAG AAA, government/public, clean borders
> over shadows) plus the **Dashboard Data** sans+mono type pairing — anchors the
> decisions below.

## 1. Product personality

QueueFlow AI is a **predictive queue intelligence platform** for government
offices, hospitals, banks, universities, embassies, and service centres. It does
not just issue tokens — it tells each citizen **when to actually arrive**, and
updates that recommendation when counters run late.

The interface must feel: **premium, trustworthy, calm, operational,
public-service.** It is an *operations instrument*, not a marketing site or an
analytics SaaS. Three audiences, one system:

| Surface | Audience | Job |
|---|---|---|
| `/admin`, `/display` | Counter staff, office | Run real service desks; show the live board |
| `/book`, `/token/:n` | Citizens (mobile) | Check in calmly; know when to leave home |

## 2. Layout principles

1. **Prediction first.** The *Recommended Arrival Time* is the hero everywhere it
   appears — large, never a footnote.
2. **Split shell.** Dark navy operational shell (command bar, public board) vs.
   light off-white content surfaces (forms, citizen pages, tables).
3. **Counter-based operations.** Admin reads as a wall of physical service desks.
4. **Citizen clarity.** Citizen pages read like a boarding pass / travel status.
5. **Board readability.** Kiosk reads from across a room.
6. **No decorative noise.** Every element supports comprehension. Borders and
   dividers do the structural work; shadows are minimal.

## 3. Color system

Semantic, disciplined. One accent family (teal) carries "live/predicted"; the
rest are strict state colors.

| Token | Hex | Use |
|---|---|---|
| `--shell` | `#0F172A` | Navy operational shell (command bar, board) |
| `--shell-2` | `#111A2E` | Raised shell surface |
| `--shell-line` | `#26344B` | Shell dividers |
| `--shell-ink` | `#E8EEF6` | Text on shell |
| `--shell-dim` | `#8A9BB4` | Muted text on shell |
| `--bg` | `#EEF2F7` | App background (muted surface) |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--surface-2` | `#F8FAFC` | Inset/quiet surface |
| `--ink` | `#0B1220` | Primary text |
| `--ink-2` | `#475569` | Secondary text |
| `--ink-3` | `#64748B` | Metadata / muted |
| `--line` | `#D9E1EC` | Hairline border |
| `--line-2` | `#CBD5E1` | Stronger divider |
| `--predict` | `#0E7490` | **Prediction accent** (arrival time, links) |
| `--live` | `#0D9488` | **Live/active** (called, serving, live states) |
| `--live-soft` | `#E0F2F1` | Live tint surface |
| `--amber` | `#B45309` | **Delay only** (text-safe; `#F59E0B` for fills) |
| `--red` | `#DC2626` | **No-show / error only** |
| `--green` | `#16A34A` | **Completed / success only** |

**Rule:** teal = live/prediction. Amber = delay. Red = no-show. Green = done.
Never use a state color decoratively. Never introduce a fifth accent.

## 4. Typography system

- **Body / UI:** IBM Plex Sans — institutional, civic, trustworthy.
- **Operational data:** IBM Plex Mono with `tabular-nums` — token numbers, times,
  counter IDs, elapsed/delay. This is the "service board" voice.
- Type roles: **Display numbers** (token #, arrival time) → mono, large.
  **Section titles** → Plex Sans 600. **Body** → Plex Sans 400/500.
  **Metadata** (timestamps, labels) → 0.7–0.8rem, uppercase tracking, muted.

Avoid: tiny low-contrast labels, all-caps everywhere, random weights, oversized
generic hero text.

## 5. Spacing system

4px base scale: `4 8 12 16 24 32 48 64` → `--s1…--s8`. Use the scale only; no
off-scale values. Cards breathe but never waste projector space. Admin grid is
density-tuned for a laptop/projector.

## 6. Component rules

- **Panel:** white surface, 1px `--line`, `--r-lg` radius, `--shadow-sm` only.
- **Buttons:** primary = solid `--predict`; secondary = white + border; danger =
  red outline. 44px min target, 3px focus ring, 150ms transitions.
- **Status badge:** quiet pill + state dot. Never a loud block of color.
- **Counter card:** a service desk — left status strip (state color), LED in the
  title, token in mono, citizen + service, elapsed/expected/delay metrics.
- **Prediction panel:** the hero. Big mono token, arrival/service times, a
  **process strip** (Queue movement → Delay detection → Prediction update →
  Recommended arrival).
- **Queue timeline:** Waiting → Called → Serving → Completed stepper.
- **Tables:** hairline row dividers, no zebra, mono tabular for token/time
  columns, sticky-clear header, responsive collapse to cards under 760px.
- **Display board:** dark shell, very large mono now-serving tokens.

## 7. Interaction rules

- Hover states on every interactive element (150–300ms).
- Highlighted/changed tokens pulse subtly (≤2 cycles), respecting reduced motion.
- Polling pauses when the tab is hidden.
- Loading → skeleton/quiet panel; never a blank screen.

## 8. Accessibility rules

- Contrast ≥ 4.5:1 body, ≥ 3:1 large text and UI. Targets ≥ 44×44px.
- Visible keyboard focus (3px ring). State never conveyed by color alone — always
  a label or dot too. `prefers-reduced-motion` honored. Semantic landmarks.

## 9. Page-specific direction

- **/admin** — Command bar (wordmark · *Predictive Queue Control Center* · live
  status · clock · Reset · *Live Demo*). Prediction Engine is the dominant hero.
  Active Counters as service desks. Demo Simulator panel. Health checklist.
  Waiting Citizens table with prominent Estimated Service / Recommended Arrival.
- **/book** — Two columns: left = "Check in without waiting in line" + 3 steps;
  right = form. Confirmation reads like a boarding-pass receipt.
- **/token/:n** — Mobile-first live status; dominant guidance line; timeline;
  large time cards.
- **/display(+kiosk)** — Wall-mounted board: office status bar, Now Serving grid,
  Next Tokens, calm footer instruction. Kiosk hides nav/non-essentials.

## 10. Anti-patterns to avoid

- Every section a rounded white card; admin that looks like a generic analytics
  dashboard; display that looks like a normal web app; booking that looks like a
  bare form; token page that isn't mobile-first.
- Prediction times visually secondary. Too many colors. Decorative icons. Gradient
  /glassmorphism/neon. Inconsistent spacing. Technical-sounding labels.
- The product needing explanation to be understood.

## 11. UX copy vocabulary (consistent terms)

Waiting Citizens · Active Counters · Prediction Engine · Estimated Service Time ·
Recommended Arrival Time · Arrival moved +X min · Called to Counter · Being
Served · Completed · No-show. Avoid backend wording and robotic labels.
