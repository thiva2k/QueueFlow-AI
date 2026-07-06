import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * ConfirmDialog — modal confirmation for destructive actions.
 * Focus is trapped, Escape cancels, the backdrop is a blurred 55% scrim, and
 * focus returns to the trigger on close. Rendered inline (no portal needed —
 * the scrim is fixed + full-viewport at z-index modal).
 *
 * Props:
 *  - open:         boolean (required)
 *  - title:        heading (required)
 *  - message:      body text (node)
 *  - confirmLabel: default "Confirm"
 *  - cancelLabel:  default "Cancel"
 *  - tone:         "danger" (default) | "default" — styles the confirm button
 *  - loading:      boolean — disables buttons + shows busy confirm label
 *  - onConfirm():  called when the confirm button is pressed
 *  - onCancel():   called on cancel / Esc / backdrop click
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}) {
  const reduce = useReducedMotion();
  const panelRef = React.useRef(null);
  const restoreRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!loading) onCancel?.();
      } else if (e.key === "Tab") {
        const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const list = Array.from(nodes).filter((n) => !n.disabled);
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey, true);
    // Focus the first focusable (the cancel button) once mounted.
    const raf = requestAnimationFrame(() => {
      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      nodes?.[0]?.focus();
    });

    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(raf);
      body.style.overflow = prevOverflow;
      const el = restoreRef.current;
      if (el && typeof el.focus === "function") el.focus();
    };
  }, [open, loading, onCancel]);

  const spring = reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 26 };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="qf-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !loading) onCancel?.();
          }}
        >
          <motion.div
            ref={panelRef}
            className={`qf-dialog qf-dialog--${tone}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="qf-dialog-title"
            aria-describedby={message ? "qf-dialog-desc" : undefined}
            initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.98 }}
            transition={spring}
          >
            <h2 className="qf-dialog__title" id="qf-dialog-title">
              {title}
            </h2>
            {message ? (
              <p className="qf-dialog__message" id="qf-dialog-desc">
                {message}
              </p>
            ) : null}
            <div className="qf-dialog__actions">
              <button
                type="button"
                className="qf-btn qf-btn--ghost"
                onClick={() => onCancel?.()}
                disabled={loading}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`qf-btn ${tone === "danger" ? "qf-btn--danger" : "qf-btn--primary"}`}
                onClick={() => onConfirm?.()}
                disabled={loading}
              >
                {loading ? "Working…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
