import React from "react";

/**
 * EmptyState — icon + one-line explanation + optional action.
 * Never leave an async region blank; use this instead.
 *
 * Props:
 *  - icon:    optional node (lucide icon)
 *  - title:   short heading (required)
 *  - message: supporting sentence (node)
 *  - action:  optional node (button / link)
 *  - tone:    "default" | "danger" | "ok" (icon accent)
 *  - compact: tighter padding for in-panel use
 *  - className, ...rest
 */
export default function EmptyState({
  icon,
  title,
  message,
  action,
  tone = "default",
  compact = false,
  className = "",
  ...rest
}) {
  const classes = [
    "qf-empty",
    `qf-empty--${tone}`,
    compact ? "qf-empty--compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {icon ? <div className="qf-empty__icon" aria-hidden="true">{icon}</div> : null}
      {title ? <p className="qf-empty__title">{title}</p> : null}
      {message ? <p className="qf-empty__message">{message}</p> : null}
      {action ? <div className="qf-empty__action">{action}</div> : null}
    </div>
  );
}
