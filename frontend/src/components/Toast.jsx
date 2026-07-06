import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { ICON } from "../constants.js";

const VARIANT_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

/**
 * useToasts — toast queue hook.
 * Returns { toasts, notify, dismiss }.
 *   notify(message, { variant = "info", duration = 4000 }) -> id
 *   dismiss(id)
 * Pair with <Toaster toasts={toasts} onDismiss={dismiss} />.
 */
export function useToasts() {
  const [toasts, setToasts] = React.useState([]);
  const timers = React.useRef(new Map());

  const dismiss = React.useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = React.useCallback(
    (message, options = {}) => {
      const { variant = "info", duration = 4000 } = options;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list, { id, message, variant }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  return { toasts, notify, dismiss };
}

/** Single toast row. */
export function Toast({ toast, onDismiss }) {
  const Icon = VARIANT_ICON[toast.variant] || Info;
  return (
    <div className={`qf-toast qf-toast--${toast.variant}`} role="status">
      <Icon size={ICON.md} className="qf-toast__icon" aria-hidden="true" />
      <span className="qf-toast__msg">{toast.message}</span>
      <button
        type="button"
        className="qf-toast__close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={ICON.sm} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Toaster — fixed bottom-right stack. aria-live=polite, auto-dismiss handled by
 * useToasts. Render once near the app/page root.
 *
 * Props: toasts (from useToasts), onDismiss (dismiss from useToasts)
 */
export function Toaster({ toasts, onDismiss }) {
  const reduce = useReducedMotion();
  return (
    <div className="qf-toaster" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout={!reduce}
            initial={{ opacity: 0, x: reduce ? 0 : 24, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: reduce ? 0 : 24, scale: reduce ? 1 : 0.98 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
          >
            <Toast toast={toast} onDismiss={onDismiss} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default Toaster;
