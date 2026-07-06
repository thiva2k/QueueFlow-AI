import React from "react";
import { cn } from "../../lib/utils.js";

/**
 * Marquee — infinite horizontal ticker (MagicUI idiom). Two copies of the
 * content translate by -100%; edges fade via mask. Respects reduced motion
 * through the global kill-switch in styles.css.
 *
 * Props: duration (s), gap (css length), reverse, pauseOnHover.
 */
export function Marquee({ children, className, duration = 30, gap = "1.5rem", reverse = false, pauseOnHover = false }) {
  return (
    <div
      className={cn("group flex overflow-hidden", className)}
      style={{
        "--marquee-gap": gap,
        gap: "var(--marquee-gap)",
        maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1 || undefined}
          className={cn(
            "flex min-w-full shrink-0 items-center justify-around gap-[var(--marquee-gap)]",
            pauseOnHover && "group-hover:[animation-play-state:paused]"
          )}
          style={{
            animation: `qf-marquee ${duration}s linear infinite ${reverse ? "reverse" : "normal"}`,
          }}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
