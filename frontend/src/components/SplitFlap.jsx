import React from "react";
import { useReducedMotion } from "framer-motion";

/**
 * SplitFlap — the Night Terminal signature. Renders a value as per-character
 * departure-board cells; characters fold like a real split-flap board when
 * they change (4-layer technique: static halves + a flipping top/bottom pair,
 * adapted from 21st.dev "FlipCountdown" by easemize).
 * Separator characters (- / . space :) render between cells without chrome.
 *
 * Props:
 *   value  string|number  what to show (uppercased)
 *   size   "sm"|"md"|"lg"|"xl"
 *   tone   "default"|"live"|"amber"|"muted"
 *   label  accessible label (defaults to value)
 */
const SIZES = {
  sm: "1.35rem",
  md: "2.25rem",
  lg: "3.4rem",
  xl: "var(--kiosk-token)",
};

const SEPARATORS = new Set(["-", "/", ".", " ", ":"]);

function FlapCell({ ch, reduce }) {
  const [current, setCurrent] = React.useState(ch);
  const [previous, setPrevious] = React.useState(ch);
  const [flipping, setFlipping] = React.useState(false);

  React.useEffect(() => {
    if (ch !== current) {
      setPrevious(current);
      setCurrent(ch);
      setFlipping(true);
    }
  }, [ch, current]);

  const onAnimationEnd = (event) => {
    // Two chained animations run inside the flipper; only the unfold ends it.
    if (event.animationName === "qfFlapUnfold") {
      setFlipping(false);
      setPrevious(current);
    }
  };

  if (reduce) {
    return (
      <span className="qf-flap__cell qf-flap__cell--static" aria-hidden="true">
        {ch}
      </span>
    );
  }

  return (
    <span className="qf-flap__cell" aria-hidden="true">
      {/* Static layers: the new char waits on top, the old char holds the bottom. */}
      <span className="qf-flap__half qf-flap__half--top">
        <span>{current}</span>
      </span>
      <span className="qf-flap__half qf-flap__half--bottom">
        <span>{previous}</span>
      </span>
      {flipping ? (
        <span className="qf-flap__flipper" key={current} onAnimationEnd={onAnimationEnd}>
          {/* Old top half folds down… */}
          <span className="qf-flap__half qf-flap__half--top qf-flap__fold">
            <span>{previous}</span>
          </span>
          {/* …then the new bottom half unfolds onto the old bottom. */}
          <span className="qf-flap__half qf-flap__half--bottom qf-flap__unfold">
            <span>{current}</span>
          </span>
        </span>
      ) : null}
    </span>
  );
}

export default function SplitFlap({ value = "", size = "md", tone = "default", label }) {
  const reduce = useReducedMotion();
  const chars = String(value).toUpperCase().split("");

  return (
    <span
      className={`qf-flap qf-flap--${tone}`}
      style={{ "--flap-size": SIZES[size] || SIZES.md }}
      role="text"
      aria-label={label || String(value)}
    >
      {chars.map((ch, i) =>
        SEPARATORS.has(ch) ? (
          <span className="qf-flap__sep" key={`sep-${i}`} aria-hidden="true">
            {ch === " " ? " " : ch}
          </span>
        ) : (
          <FlapCell key={`cell-${i}`} ch={ch} reduce={reduce} />
        )
      )}
    </span>
  );
}
