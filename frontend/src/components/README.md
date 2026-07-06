# QueueFlow AI — shared design-system components

Import from the barrel so paths stay stable:

```jsx
import {
  StatusChip, StatCard, AnimatedNumber, Skeleton, EmptyState,
  LiveIndicator, PageHeader, ConfirmDialog, Toaster, useToasts,
} from "../components/index.js";
```

All styling lives in `src/styles.css` (foundation-owned). Components use the
`qf-*` class namespace — never restyle them from page CSS; compose instead.
Everything is reduced-motion safe and theme-locked to the dark "Signal Hall"
palette. Copy + status labels come from `src/constants.js`
(`STATUS_LABELS`, `LABELS`, `ICON`) — use those constants, don't hard-code.

---

## StatusChip

Canonical status pill: coloured dot + label. Pulses when the status is live
(`called` / `serving`). Colours are locked to the semantic map.

| Prop        | Type                                                              | Default | Notes |
|-------------|------------------------------------------------------------------|---------|-------|
| `status`    | `"waiting"\|"called"\|"serving"\|"completed"\|"missed"\|"cancelled"` | —       | Required. Drives label + colour. |
| `label`     | `string`                                                         | auto    | Override visible text (defaults to `STATUS_LABELS[status]`). |
| `size`      | `"sm" \| "md"`                                                   | `"md"`  | |
| `className` | `string`                                                        | `""`    | Extra classes. Other props spread onto the `<span>`. |

```jsx
<StatusChip status={token.status} />
<StatusChip status="serving" size="sm" />
```

Label map (display): Waiting / Called / Now serving / Completed / No-show / Cancelled.

---

## StatCard

Eyebrow label + big mono value + optional delta / sparkline. Pass an
`<AnimatedNumber>` as `value` for roll-on-change.

| Prop        | Type                                             | Default     | Notes |
|-------------|--------------------------------------------------|-------------|-------|
| `label`     | `node`                                           | —           | Required. Eyebrow text. |
| `value`     | `node \| string \| number`                       | —           | Required. Rendered mono/tabular. |
| `unit`      | `node`                                           | —           | Small suffix (e.g. `"min"`). |
| `delta`     | `node`                                           | —           | Line under the value (trend pill / caption). |
| `sparkline` | `node`                                           | —           | Corner slot for an inline SVG sparkline. |
| `icon`      | `node`                                           | —           | Leading lucide icon (`size={ICON.sm}`). |
| `tone`      | `"default"\|"live"\|"ok"\|"warn"\|"danger"`      | `"default"` | Tints the value. |
| `className` | `string`                                         | `""`        | Spreads remaining props onto `<article>`. |

```jsx
<StatCard label="Waiting now" value={<AnimatedNumber value={waiting} />} tone="live" />
<StatCard label="Avg service" value={<AnimatedNumber value={avg} />} unit="min" />
```

---

## AnimatedNumber

Mono value that rolls (old slides up / new slides in) + a brief cyan flash on
change — the cause→effect signal. Instant + flash-free under reduced motion.
CLS-safe (clips the roll).

| Prop        | Type                     | Default  | Notes |
|-------------|--------------------------|----------|-------|
| `value`     | `number \| string`       | —        | Required. Change it to trigger the roll. |
| `format`    | `(value) => string`      | `String` | Format before display (e.g. time formatter). |
| `className` | `string`                 | `""`     | Spreads remaining props onto the wrapper `<span>`. |

```jsx
<AnimatedNumber value={peopleAhead} />
<AnimatedNumber value={arrivalTs} format={formatClock} />
```

Only the displayed (post-`format`) string is compared, so formatter output
drives the animation.

---

## Skeleton

Shimmer placeholder for any async region (>300ms). Match final dimensions to
avoid layout shift. Decorative (`aria-hidden`); set `aria-busy` on the region.

| Prop        | Type            | Default            | Notes |
|-------------|-----------------|--------------------|-------|
| `width`     | `string`        | `"100%"`           | Any CSS width. |
| `height`    | `string`        | `"1rem"`           | Any CSS height. |
| `radius`    | `string`        | `"var(--r-sm)"`    | Border radius. |
| `count`     | `number`        | `1`                | Render N stacked, staggered lines. |
| `className` / `style` | —     | —                  | Merged onto each block. |

```jsx
<div aria-busy="true"><Skeleton height="120px" radius="var(--r-lg)" /></div>
<Skeleton count={3} height="14px" />
```

---

## EmptyState

Icon + one-line explanation + optional action. Never leave a region blank.

| Prop        | Type                          | Default     | Notes |
|-------------|-------------------------------|-------------|-------|
| `icon`      | `node`                        | —           | Lucide icon (`size={ICON.lg}`). |
| `title`     | `node`                        | —           | Required-ish. Short heading. |
| `message`   | `node`                        | —           | Supporting sentence. |
| `action`    | `node`                        | —           | Button / link. |
| `tone`      | `"default"\|"danger"\|"ok"`   | `"default"` | Icon accent. |
| `compact`   | `boolean`                     | `false`     | Tighter padding for in-panel use. |

```jsx
<EmptyState
  icon={<SearchX size={ICON.lg} />}
  title="We couldn't find that token"
  message="Check the number printed on your ticket."
  action={<button className="qf-btn qf-btn--ghost">Look up again</button>}
/>
```

---

## LiveIndicator

Pulsing dot + "Live · updated {n}s ago". Ticks locally between polls.

| Prop        | Type                         | Default  | Notes |
|-------------|------------------------------|----------|-------|
| `updatedAt` | `Date \| number(ms) \| null` | —        | Timestamp of last successful poll. |
| `active`    | `boolean`                    | `true`   | `false` → muted "Updates paused" (no pulse). |
| `label`     | `string`                     | `"Live"` | Leading word. |

```jsx
<LiveIndicator updatedAt={lastUpdated} active={pollingOn} />
```

---

## PageHeader

Eyebrow + Space Grotesk display title + subtitle + trailing actions slot.

| Prop        | Type              | Default | Notes |
|-------------|-------------------|---------|-------|
| `eyebrow`   | `node`            | —       | Mono/uppercase kicker. |
| `title`     | `node`            | —       | Required. Display headline. |
| `subtitle`  | `node`            | —       | Supporting line. |
| `actions`   | `node`            | —       | Right-edge slot (LiveIndicator, buttons). |
| `size`      | `"md" \| "lg"`    | `"md"`  | `"lg"` = hero scale (`--display-1`). |

```jsx
<PageHeader
  eyebrow="Your turn"
  title="Know when it's your turn."
  subtitle="Arrive by the recommended time — not before."
  size="lg"
  actions={<LiveIndicator updatedAt={ts} />}
/>
```

---

## ConfirmDialog

Modal confirmation for destructive actions (e.g. Reset Demo Data). Focus is
trapped, Escape/backdrop cancels, focus restores to the trigger, body scroll
locks. Blurred 55% scrim at z-index modal.

| Prop           | Type                    | Default     | Notes |
|----------------|-------------------------|-------------|-------|
| `open`         | `boolean`               | —           | Required. |
| `title`        | `node`                  | —           | Required. |
| `message`      | `node`                  | —           | Body text. |
| `confirmLabel` | `string`                | `"Confirm"` | |
| `cancelLabel`  | `string`                | `"Cancel"`  | |
| `tone`         | `"danger"\|"default"`   | `"danger"`  | Styles the confirm button. |
| `loading`      | `boolean`               | `false`     | Disables buttons; confirm shows "Working…". |
| `onConfirm`    | `() => void`            | —           | |
| `onCancel`     | `() => void`            | —           | Called on cancel / Esc / backdrop. |

```jsx
const [open, setOpen] = useState(false);
<ConfirmDialog
  open={open}
  title="Reset demo data?"
  message="This clears all tokens and reseeds the office. This can't be undone."
  confirmLabel="Reset data"
  loading={resetting}
  onCancel={() => setOpen(false)}
  onConfirm={handleReset}
/>
```

---

## Toast / useToasts / Toaster

Bottom-right stack, `aria-live=polite`, auto-dismiss (default 4s).

`useToasts()` → `{ toasts, notify, dismiss }`
- `notify(message, { variant = "info", duration = 4000 }) → id`
  variants: `"success" | "error" | "info"`. `duration: 0` = sticky.
- `dismiss(id)`

Render `<Toaster toasts={toasts} onDismiss={dismiss} />` once near the page root.

```jsx
const { toasts, notify, dismiss } = useToasts();
// ...
notify("Token cancelled.", { variant: "success" });
notify(describeError(err), { variant: "error" });
// ...
return (<>{/* page */}<Toaster toasts={toasts} onDismiss={dismiss} /></>);
```

`Toast` (single row) is also exported if you need to render one standalone.

---

## Buttons + primitives (CSS-only, no component)

Use these classes directly for buttons so styling stays consistent:
`qf-btn` + one of `qf-btn--primary` (cyan), `qf-btn--secondary`,
`qf-btn--ghost`, `qf-btn--danger`. All are 44px min touch target.

Eyebrows outside PageHeader: `<p className="qf-eyebrow">…</p>`.
Standard page wrapper: `<main className="qf-shell">…</main>`.
