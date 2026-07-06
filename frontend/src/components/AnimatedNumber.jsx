import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * AnimatedNumber — monospace, tabular data value that rolls on change.
 * When `value` changes, the old value slides up and out while the new value
 * slides in from below, and the whole value briefly flashes cyan (the
 * cause->effect signal). Fully instant + flash-free under reduced motion.
 *
 * Props:
 *  - value:   number | string — the value to display (required)
 *  - format:  (value) => string — optional formatter (default String)
 *  - className, ...rest spread onto the wrapper <span>
 *
 * Layout is CLS-safe: the wrapper reserves height and clips the roll so
 * surrounding content never shifts.
 */
export default function AnimatedNumber({ value, format, className = "", ...rest }) {
  const reduce = useReducedMotion();
  const display = format ? format(value) : String(value ?? "");
  const [flash, setFlash] = React.useState(false);
  const prev = React.useRef(display);

  React.useEffect(() => {
    if (prev.current !== display) {
      prev.current = display;
      if (reduce) return undefined;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [display, reduce]);

  const classes = ["qf-animnum", flash ? "qf-animnum--flash" : "", className]
    .filter(Boolean)
    .join(" ");

  if (reduce) {
    return (
      <span className={classes} {...rest}>
        {display}
      </span>
    );
  }

  return (
    <span className={classes} {...rest}>
      <span className="qf-animnum__viewport">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={display}
            className="qf-animnum__roll"
            initial={{ y: "0.9em", opacity: 0 }}
            animate={{ y: "0em", opacity: 1 }}
            exit={{ y: "-0.9em", opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {display}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
