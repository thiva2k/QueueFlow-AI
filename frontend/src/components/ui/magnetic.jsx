import React from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

/**
 * Magnetic — its child drifts slightly toward the cursor while hovered, then
 * springs back on leave. The premium "the button reaches for you" micro-
 * interaction. Renders a motion.span wrapper; pass a button/anchor as child.
 * Disabled under prefers-reduced-motion.
 *
 * Props: strength (px of max pull), className.
 */
export function Magnetic({ children, strength = 14, className }) {
  const reduce = useReducedMotion();
  const ref = React.useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });

  const onMove = (event) => {
    if (reduce || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = event.clientX - (rect.left + rect.width / 2);
    const relY = event.clientY - (rect.top + rect.height / 2);
    x.set(Math.max(-strength, Math.min(strength, relX * 0.4)));
    y.set(Math.max(-strength, Math.min(strength, relY * 0.4)));
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy, display: "inline-flex" }}
      className={className}
    >
      {children}
    </motion.span>
  );
}
