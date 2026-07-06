// Shared constants for QueueFlow AI — "Signal Hall" rebuild.
// Every agent reads from here so copy + tokens stay identical across pages.

// Canonical token status values (backend contract):
// waiting | called | serving | completed | missed | cancelled
export const STATUS_LABELS = {
  waiting: "Waiting",
  called: "Called",
  serving: "Now serving",
  completed: "Completed",
  missed: "No-show",
  cancelled: "Cancelled",
};

// Status -> semantic tone. Drives StatusChip colour + dot.
// Tones map to CSS accent families: neutral/live/ok/danger.
export const STATUS_TONE = {
  waiting: "neutral",
  called: "live",
  serving: "live",
  completed: "ok",
  missed: "danger",
  cancelled: "neutral",
};

// Which statuses count as "live" (pulsing dot).
export const LIVE_STATUSES = new Set(["called", "serving"]);

export const LABELS = {
  estimatedServiceTime: "Estimated service time",
  recommendedArrival: "Recommended arrival time",
  // Shown wherever the backend returns null for the two values above.
  estimatesPaused: "Estimates paused — counters are closed right now.",
};

// Icon sizes for lucide-react — use these everywhere for a consistent rhythm.
export const ICON = { sm: 14, md: 18, lg: 24 };

export function statusLabel(status) {
  return STATUS_LABELS[status] || (status ? String(status) : "Unknown");
}
