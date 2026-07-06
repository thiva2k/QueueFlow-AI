import React from "react";

function secondsSince(ts) {
  if (ts == null) return null;
  const then = ts instanceof Date ? ts.getTime() : Number(ts);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 1000));
}

function agoLabel(seconds) {
  if (seconds == null) return "waiting for data";
  if (seconds < 5) return "updated just now";
  if (seconds < 60) return `updated ${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  return `updated ${m}m ago`;
}

/**
 * LiveIndicator — pulsing dot + "Live · updated {n}s ago".
 * Drop it wherever polling drives data. The seconds counter ticks locally so
 * it stays fresh between polls without re-render churn from the parent.
 *
 * Props:
 *  - updatedAt: Date | number(ms) | null — timestamp of the last successful poll
 *  - active:    boolean — when false, renders a muted "Paused" state (no pulse)
 *  - label:     override the leading word (default "Live")
 *  - className, ...rest
 */
export default function LiveIndicator({ updatedAt, active = true, label = "Live", className = "", ...rest }) {
  const [, force] = React.useReducer((n) => n + 1, 0);

  React.useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, [active]);

  const seconds = secondsSince(updatedAt);
  const classes = ["qf-live", active ? "qf-live--on" : "qf-live--off", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} role="status" aria-live="polite" {...rest}>
      <span className="qf-live__dot" aria-hidden="true" />
      <span className="qf-live__text">
        {active ? (
          <>
            <strong>{label}</strong>
            <span className="qf-live__sep">·</span>
            <span>{agoLabel(seconds)}</span>
          </>
        ) : (
          <strong>Updates paused</strong>
        )}
      </span>
    </span>
  );
}
