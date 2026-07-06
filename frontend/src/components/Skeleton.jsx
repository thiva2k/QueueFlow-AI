import React from "react";

/**
 * Skeleton — shimmer placeholder for any async region (>300ms rule).
 * Match the final element's dimensions to avoid layout shift.
 *
 * Props:
 *  - width:  CSS width  (default "100%")
 *  - height: CSS height (default "1rem")
 *  - radius: CSS border-radius (default "var(--r-sm)")
 *  - count:  render N stacked lines (default 1)
 *  - className, style, ...rest
 *
 * Decorative by default (aria-hidden). Wrap the region in an element with
 * aria-busy="true" if you need to announce loading.
 */
export default function Skeleton({
  width = "100%",
  height = "1rem",
  radius = "var(--r-sm)",
  count = 1,
  className = "",
  style,
  ...rest
}) {
  const classes = ["qf-skeleton", className].filter(Boolean).join(" ");
  const items = Array.from({ length: Math.max(1, count) });

  return (
    <>
      {items.map((_, i) => (
        <span
          key={i}
          className={classes}
          aria-hidden="true"
          style={{
            width,
            height,
            borderRadius: radius,
            // stagger multi-line shimmer slightly
            animationDelay: count > 1 ? `${i * 0.08}s` : undefined,
            ...style,
          }}
          {...rest}
        />
      ))}
    </>
  );
}
