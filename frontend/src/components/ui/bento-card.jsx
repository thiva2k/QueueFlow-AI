import React from "react";
import { cn } from "../../lib/utils.js";

/**
 * BentoCard — glass tile whose border/glow follows the cursor.
 * Adapted from 21st.dev "Cybernetic Bento Grid" (dhiluxui): the component
 * tracks the pointer into --mouse-x/--mouse-y; the .qf-bento utility
 * (styles/tailwind.css) paints the radial spotlight there.
 *
 * Props: tone "live"|"amber" (spotlight hue), as (element), className, rest.
 */
export function BentoCard({ className, children, tone = "live", as: Comp = "div", ...props }) {
  const ref = React.useRef(null);

  const onMouseMove = (event) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
  };

  return (
    <Comp
      ref={ref}
      onMouseMove={onMouseMove}
      className={cn("qf-bento", tone === "amber" && "qf-bento-amber", className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

/** BentoGrid — the standard 12-col asymmetric wrapper for BentoCards. */
export function BentoGrid({ className, children }) {
  return <div className={cn("grid grid-cols-12 gap-4", className)}>{children}</div>;
}
