import React from "react";

/**
 * FlowField — ambient canvas: dust motes drifting in morning light. Particles
 * drift left→right along gently undulating streamlines with faint tails.
 * Heroes only (absolute-positioned inside a relative parent, .qf-flow).
 * Self-disables under prefers-reduced-motion; pauses on hidden tabs.
 */
const MOTE_COLORS = [
  [217, 119, 6], // marigold
  [14, 124, 134], // teal
  [22, 35, 59], // ink (faint)
];

export default function FlowField({ density = 0.00007, className = "" }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let raf = 0;
    let w = 0;
    let h = 0;
    let particles = [];
    let t = 0;

    const spawn = (anywhere) => ({
      x: anywhere ? Math.random() * w : -14,
      y: Math.random() * h,
      s: 0.25 + Math.random() * 0.8,
      r: 0.7 + Math.random() * 1.5,
      a: 0.06 + Math.random() * 0.16,
      p: Math.random() * Math.PI * 2,
      c: MOTE_COLORS[Math.floor(Math.random() * MOTE_COLORS.length)],
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(28, Math.min(110, Math.round(w * h * density)));
      particles = Array.from({ length: count }, () => spawn(true));
    };

    const tick = () => {
      t += 0.004;
      ctx.clearRect(0, 0, w, h);
      for (const pt of particles) {
        const ang = Math.sin(pt.y * 0.008 + t * 2 + pt.p) * 0.35;
        const vx = Math.cos(ang) * pt.s;
        const vy = Math.sin(ang) * pt.s * 0.6;
        pt.x += vx;
        pt.y += vy;
        if (pt.x > w + 16 || pt.y < -16 || pt.y > h + 16) Object.assign(pt, spawn(false));

        const [cr, cg, cb] = pt.c;
        const tail = 7 + pt.s * 9;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - (vx / pt.s) * tail, pt.y - (vy / pt.s) * tail);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${pt.a * 0.3})`;
        ctx.lineWidth = pt.r * 0.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${pt.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === "visible") raf = requestAnimationFrame(tick);
    };

    resize();
    raf = requestAnimationFrame(tick);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return <canvas ref={ref} className={`qf-flow ${className}`.trim()} aria-hidden="true" />;
}
