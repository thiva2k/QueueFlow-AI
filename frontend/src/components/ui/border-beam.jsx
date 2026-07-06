import React from "react";
import { cn } from "../../lib/utils.js";

/**
 * BorderBeam — a bright gradient segment orbiting the parent's border
 * (MagicUI idiom). Parent must be position:relative with a border-radius.
 * Degrades to nothing where offset-path rect() is unsupported.
 *
 * Props: size (beam length px), duration (s), delay (s), colorFrom/colorTo,
 * reverse, borderWidth (px).
 */
export function BorderBeam({
  size = 120,
  duration = 7,
  delay = 0,
  colorFrom = "var(--live)",
  colorTo = "var(--amber)",
  reverse = false,
  borderWidth = 1.5,
  className,
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={{
        border: `${borderWidth}px solid transparent`,
        maskImage: "linear-gradient(transparent,transparent), linear-gradient(#000,#000)",
        maskClip: "padding-box, border-box",
        maskComposite: "intersect",
        WebkitMaskImage: "linear-gradient(transparent,transparent), linear-gradient(#000,#000)",
        WebkitMaskClip: "padding-box, border-box",
        WebkitMaskComposite: "source-in",
      }}
    >
      <div
        className={cn("absolute aspect-square", className)}
        style={{
          width: size,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
          offsetPath: "rect(0 100% 100% 0 round 24px)",
          offsetAnchor: reverse ? "0% 50%" : "100% 50%",
          animation: `qf-beam ${duration}s linear infinite ${reverse ? "reverse" : "normal"}`,
          animationDelay: `${delay}s`,
        }}
      />
    </div>
  );
}
