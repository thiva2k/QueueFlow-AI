import React from "react";
import { useInView, useSpring } from "framer-motion";
import { cn } from "../../lib/utils.js";

/**
 * NumberTicker — springs from 0 to `value` when scrolled into view
 * (21st.dev / MagicUI idiom). For hero stats and KPI reveals; live-updating
 * data should keep using <AnimatedNumber /> which animates BETWEEN values.
 */
export function NumberTicker({ value, className, prefix = "", suffix = "", stiffness = 80, damping = 24 }) {
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const spring = useSpring(0, { stiffness, damping });
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (inView) spring.set(Number(value) || 0);
  }, [inView, value, spring]);

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
