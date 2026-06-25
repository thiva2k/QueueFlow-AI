import { useEffect, useRef } from "react";

/**
 * Runs `callback` on a fixed interval, but only while the document is visible.
 *
 * - Polling is paused when document.visibilityState === "hidden".
 * - When the tab becomes visible again, `callback` is invoked immediately
 *   (to refetch fresh data) and the interval resumes.
 *
 * The latest `callback` is always used without resetting the timer, so callers
 * can pass an inline/recreated function without churning the interval.
 *
 * @param {() => void} callback  Function to run on each tick.
 * @param {number} intervalMs    Polling interval in milliseconds.
 * @param {boolean} [enabled=true]  When false, no polling is scheduled.
 */
export default function useVisiblePolling(callback, intervalMs, enabled = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;

    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (timer === null) {
        timer = window.setInterval(() => callbackRef.current(), intervalMs);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        // Refetch immediately on resume so stale data is corrected at once.
        callbackRef.current();
        start();
      }
    };

    // Initialize based on current visibility.
    if (document.visibilityState !== "hidden") {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stop();
    };
  }, [intervalMs, enabled]);
}
