import React, { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Clock3, History, Search, Ticket } from "lucide-react";
import { EmptyState } from "../components/index.js";
import { ICON } from "../constants.js";
import "../styles/status.css";

const RECENT_TOKENS_KEY = "qf_recent_tokens";

// Recent tokens are written by the booking flow + successful lookups as a JSON
// array of token-number strings, newest first, max 5. Read defensively so a
// mixed/legacy shape (objects with token_number) never throws.
function readRecentTokens() {
  try {
    const raw = localStorage.getItem(RECENT_TOKENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") return item.token_number || item.number || "";
        return "";
      })
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------- motion variants */
const cardContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};
const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};
const chipsContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};
const chipItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } },
};

export default function TokenLookup({ onNavigate, initialError = "" }) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState("");
  const [error, setError] = useState(initialError);
  const recent = useMemo(() => readRecentTokens(), []);

  function goToToken(tokenNumber) {
    onNavigate(`/token/${encodeURIComponent(tokenNumber)}`);
  }

  function submit(event) {
    event.preventDefault();
    const token = value.trim().toUpperCase();
    if (!token) {
      setError("Enter your token number, for example A-021.");
      return;
    }
    goToToken(token);
  }

  return (
    <main className="qf-shell lookup-shell">
      <motion.div
        className="qf-panel qf-panel--holo lookup-card2"
        variants={cardContainer}
        initial={reduce ? false : "hidden"}
        animate="show"
      >
        <span className="qf-ticks pointer-events-none absolute inset-0" aria-hidden="true" />
        <motion.span variants={rise} className="lookup-card2__mark" aria-hidden="true">
          <Ticket size={ICON.lg} />
        </motion.span>
        <motion.p variants={rise} className="qf-eyebrow">Track your token</motion.p>
        <motion.h1 variants={rise} className="lookup-card2__title">Check your token status</motion.h1>
        <motion.p variants={rise} className="lookup-card2__copy">
          Enter your token number to see your live position, recommended arrival time, and when it's your turn.
        </motion.p>

        <motion.form variants={rise} onSubmit={submit} className="lookup-form2" noValidate>
          <label className="lookup-form2__label" htmlFor="token_lookup">
            Token number
          </label>
          <div className="lookup-form2__row">
            <input
              id="token_lookup"
              className="lookup-input2 mono"
              value={value}
              onChange={(event) => {
                setValue(event.target.value.toUpperCase());
                setError("");
              }}
              placeholder="e.g. A-021"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              inputMode="text"
              aria-invalid={error ? "true" : "false"}
              aria-describedby="token_lookup_error"
            />
            <button className="qf-btn qf-btn--primary" type="submit">
              <Search size={ICON.sm} aria-hidden="true" />
              <span>Check status</span>
            </button>
          </div>
          <p className="lookup-form2__error" id="token_lookup_error" role="alert" aria-live="polite">
            {error}
          </p>
        </motion.form>

        <motion.div variants={rise} className="lookup-recent" aria-label="Recent tokens on this device">
          <p className="lookup-recent__title">Recent tokens on this device</p>
          {recent.length ? (
            <motion.div className="lookup-chips" variants={chipsContainer}>
              {recent.map((tokenNumber) => (
                <motion.button
                  key={tokenNumber}
                  type="button"
                  className="lookup-chip"
                  variants={chipItem}
                  whileHover={reduce ? undefined : { y: -2 }}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  onClick={() => goToToken(tokenNumber)}
                >
                  <History size={ICON.sm} aria-hidden="true" />
                  <span>{tokenNumber}</span>
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <EmptyState
              compact
              icon={<Clock3 size={ICON.lg} />}
              title="No recent tokens yet"
              message="Tokens you book or look up on this device will appear here."
            />
          )}
        </motion.div>

        <motion.button variants={rise} className="lookup-secondary2" type="button" onClick={() => onNavigate("/book")}>
          <span>Don&apos;t have a token yet? Book one</span>
          <ArrowRight size={ICON.sm} aria-hidden="true" />
        </motion.button>
      </motion.div>
    </main>
  );
}
