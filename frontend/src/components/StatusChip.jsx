import React from "react";
import { STATUS_LABELS, STATUS_TONE, LIVE_STATUSES } from "../constants.js";

/**
 * StatusChip — canonical token/counter status pill.
 * Small coloured dot + label. Pulses (CSS `pulse` keyframe) when the status is
 * live (called / serving). Colours come strictly from the semantic accent set.
 *
 * Props:
 *  - status: one of waiting|called|serving|completed|missed|cancelled (required)
 *  - label:  optional override for the visible text (defaults to STATUS_LABELS)
 *  - size:   "sm" | "md" (default "md")
 *  - className, ...rest spread onto the <span>
 */
export default function StatusChip({ status, label, size = "md", className = "", ...rest }) {
  const tone = STATUS_TONE[status] || "neutral";
  const isLive = LIVE_STATUSES.has(status);
  const text = label != null ? label : STATUS_LABELS[status] || status || "Unknown";

  const classes = [
    "qf-chip",
    `qf-chip--${tone}`,
    size === "sm" ? "qf-chip--sm" : "",
    isLive ? "qf-chip--live" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} data-status={status} {...rest}>
      <span className="qf-chip__dot" aria-hidden="true" />
      <span className="qf-chip__label">{text}</span>
    </span>
  );
}
