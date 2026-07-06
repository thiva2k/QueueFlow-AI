import React from "react";
import { cn } from "../../lib/utils.js";

/**
 * AuroraMesh — a living gradient-mesh background: several large, heavily
 * blurred colour fields that slowly drift, scale and blend (the Stripe /
 * Linear / Vercel hero signature; pattern identified from 21st.dev's
 * "Aurora Background" family). Warm Daylight Hall palette by default.
 *
 * Pure CSS animation → the global prefers-reduced-motion kill-switch in
 * styles.css freezes it into a static gradient automatically.
 *
 * Props: className, intensity ("soft" | "bold").
 */
const BLOBS = [
  { c: "rgba(245, 158, 11, VAR)", x: "12%", y: "18%", s: 42, anim: "qfAuroraA", d: 22, delay: 0 },
  { c: "rgba(14, 124, 134, VAR)", x: "78%", y: "12%", s: 46, anim: "qfAuroraB", d: 26, delay: -6 },
  { c: "rgba(228, 87, 46, VAR)", x: "68%", y: "72%", s: 38, anim: "qfAuroraC", d: 30, delay: -12 },
  { c: "rgba(20, 165, 176, VAR)", x: "22%", y: "80%", s: 40, anim: "qfAuroraA", d: 28, delay: -18 },
  { c: "rgba(217, 119, 6, VAR)", x: "48%", y: "44%", s: 34, anim: "qfAuroraB", d: 24, delay: -9 },
];

export function AuroraMesh({ className, intensity = "soft" }) {
  const alpha = intensity === "bold" ? 0.5 : 0.32;
  return (
    <div className={cn("qf-aurora", className)} aria-hidden="true">
      {BLOBS.map((b, i) => (
        <span
          key={i}
          className="qf-aurora__blob"
          style={{
            left: b.x,
            top: b.y,
            width: `${b.s}vw`,
            height: `${b.s}vw`,
            background: `radial-gradient(circle at center, ${b.c.replace("VAR", alpha)} 0%, transparent 68%)`,
            animationName: b.anim,
            animationDuration: `${b.d}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
