import React from "react";

/**
 * PageHeader — eyebrow + Space Grotesk display title + subtitle slot.
 * Optional right-aligned actions/meta slot (LiveIndicator, buttons).
 *
 * Props:
 *  - eyebrow:  small mono/uppercase kicker (string | node)
 *  - title:    display headline (string | node) (required)
 *  - subtitle: supporting line (string | node)
 *  - actions:  node rendered on the trailing edge
 *  - size:     "lg" (hero) | "md" (default)
 *  - className, ...rest
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  size = "md",
  className = "",
  ...rest
}) {
  const classes = ["qf-pageheader", `qf-pageheader--${size}`, className].filter(Boolean).join(" ");

  return (
    <header className={classes} {...rest}>
      <div className="qf-pageheader__text">
        {eyebrow ? <p className="qf-eyebrow">{eyebrow}</p> : null}
        <h1 className="qf-pageheader__title">{title}</h1>
        {subtitle ? <p className="qf-pageheader__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="qf-pageheader__actions">{actions}</div> : null}
    </header>
  );
}
