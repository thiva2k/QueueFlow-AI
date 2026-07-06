import React from "react";

/**
 * StatCard — eyebrow label + big mono value + optional delta / sparkline slot.
 * Value is rendered mono/tabular. Pass an <AnimatedNumber> as `value` to get
 * the roll-on-change behaviour; a plain string/number works too.
 *
 * Props:
 *  - label:     eyebrow text (required)
 *  - value:     node | string | number — the headline datum (required)
 *  - unit:      optional small suffix next to the value (e.g. "min")
 *  - delta:     optional node rendered under the value (trend pill, caption)
 *  - sparkline: optional node rendered in the corner (inline SVG)
 *  - icon:      optional leading node (lucide icon)
 *  - tone:      "default" | "live" | "ok" | "warn" | "danger" (accent)
 *  - className, ...rest spread onto the wrapper
 */
export default function StatCard({
  label,
  value,
  unit,
  delta,
  sparkline,
  icon,
  tone = "default",
  className = "",
  ...rest
}) {
  const classes = ["qf-statcard", `qf-statcard--${tone}`, className].filter(Boolean).join(" ");

  return (
    <article className={classes} {...rest}>
      <header className="qf-statcard__head">
        <span className="qf-statcard__label">
          {icon ? <span className="qf-statcard__icon" aria-hidden="true">{icon}</span> : null}
          {label}
        </span>
        {sparkline ? <span className="qf-statcard__spark">{sparkline}</span> : null}
      </header>
      <div className="qf-statcard__value">
        {value}
        {unit ? <span className="qf-statcard__unit">{unit}</span> : null}
      </div>
      {delta ? <div className="qf-statcard__delta">{delta}</div> : null}
    </article>
  );
}
