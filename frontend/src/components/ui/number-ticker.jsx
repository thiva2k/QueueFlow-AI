import React from "react";
import { useInView, useSpring, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils.js";

/**
 * NumberTicker — springs from 0 to `value` when scrolled into view
 * (21st.dev / MagicUI idiom). For hero stats and KPI reveals; live-updating
 * data should keep using <AnimatedNumber /> which animates BETWEEN values.
 */
export function NumberTicker({ value, className, prefix = "", suffix = "", stiffness = 80, damping = 24 }) {
  const ref = React.useRef(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const spring = useSpring(0, { stiffness, damping });
  const [display, setDisplay] = React.useState(reduce ? Number(value) || 0 : 0);

  React.useEffect(() => {
    if (!inView) return;
    // Reduced motion: snap to the final value with no count-up roll.
    if (reduce) {
      setDisplay(Number(value) || 0);
      return;
    }
    spring.set(Number(value) || 0);
  }, [inView, value, spring, reduce]);

  React.useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(Math.round(v)));
    return unsub;
  }, [spring]);

  return (
    <span ref={ref} className={cn("font-mono tabular-nums", className)}>
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}
