const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const REQUEST_TIMEOUT_MS = 8000;
const STAFF_KEY_STORAGE = "qf_staff_key";

// Entered at runtime and kept in sessionStorage so the key is not baked into
// the public JS bundle and does not outlive the browser session.
function getStaffKey() {
  try {
    const runtime = sessionStorage.getItem(STAFF_KEY_STORAGE);
    if (runtime && runtime.trim()) return runtime.trim();
  } catch {
    // sessionStorage may be unavailable (private mode / SSR) — fall through.
  }
  return null;
}

function setStaffKey(key) {
  try {
    if (key && String(key).trim()) {
      sessionStorage.setItem(STAFF_KEY_STORAGE, String(key).trim());
    } else {
      sessionStorage.removeItem(STAFF_KEY_STORAGE);
    }
  } catch {
    // Ignore storage failures — the caller still gets the current-request key.
  }
}

function buildTimeoutSignal() {
  // Prefer the standard AbortSignal.timeout when available; fall back to a
  // manually controlled AbortController for older runtimes.
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cancel: () => {} };
  }
  if (typeof AbortController !== "undefined") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return { signal: controller.signal, cancel: () => clearTimeout(timer) };
  }
  return { signal: undefined, cancel: () => {} };
}

async function request(path, options = {}) {
  const { signal, cancel } = buildTimeoutSignal();
  const staffKey = getStaffKey();

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      signal,
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(staffKey ? { "X-API-Key": staffKey } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (networkError) {
    cancel();
    if (networkError?.name === "AbortError" || networkError?.name === "TimeoutError") {
      const timeoutError = new Error(
        `Request to ${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The backend may be unreachable.`
      );
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }
    const connError = new Error(
      networkError?.message || `Could not reach the backend at ${API_BASE_URL}.`
    );
    connError.code = "NETWORK";
    throw connError;
  } finally {
    cancel();
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!response.ok) {
    const detail = data?.detail || data?.message || response.statusText;
    const error = new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join(", ") : detail);
    error.status = response.status;
    // Preserve the structured validation payload so describeError can be smart.
    if (Array.isArray(data?.detail)) error.validation = data.detail;
    throw error;
  }

  return data;
}

/**
 * Translate any thrown API error into a single plain-language sentence that is
 * safe to show a citizen: no URLs, no "backend"/"server" jargon, no stack noise.
 * Always returns a non-empty string.
 */
function describeError(error) {
  if (!error) return "Something went wrong. Please try again.";

  const code = error.code;
  const status = error.status;

  if (code === "TIMEOUT") {
    return "This is taking longer than expected. Please check your connection and try again.";
  }
  if (code === "NETWORK") {
    return "We can't reach the service right now. Please check your connection and try again.";
  }

  if (typeof status === "number") {
    if (status === 401 || status === 403) {
      return "You don't have permission to do that. Please sign in with a staff key and try again.";
    }
    if (status === 404) {
      return "We couldn't find that. Please double-check the details and try again.";
    }
    if (status === 409) {
      return "That can't be done right now because the queue has already moved on. Please refresh and try again.";
    }
    if (status === 422 || status === 400) {
      // Prefer a specific field message when the backend supplied one.
      const first = Array.isArray(error.validation) ? error.validation[0] : null;
      if (first?.msg) {
        const msg = String(first.msg).replace(/^value error,?\s*/i, "").trim();
        if (msg) return msg.charAt(0).toUpperCase() + msg.slice(1);
      }
      return "Please check the details you entered and try again.";
    }
    if (status === 429) {
      return "You're going a little fast. Please wait a moment and try again.";
    }
    if (status >= 500) {
      return "Something went wrong on our side. Please try again in a moment.";
    }
  }

  // Fallback: never leak a URL or the word "backend".
  const raw = typeof error.message === "string" ? error.message : "";
  if (!raw || /https?:\/\//i.test(raw) || /backend|fetch|abort/i.test(raw)) {
    return "Something went wrong. Please try again.";
  }
  return raw;
}

export const api = {
  health: () => request("/health"),
  getServices: () => request("/services"),
  getCounters: () => request("/counters"),
  getTokens: () => request("/tokens"),
  getStaffTokens: () => request("/admin/tokens"),
  getStaffQueue: () => request("/admin/queue"),
  getTokenByNumber: (tokenNumber) => request(`/tokens/by-number/${encodeURIComponent(tokenNumber)}`),
  getTokenPrediction: (tokenId) => request(`/tokens/${tokenId}/prediction`),
  getModelInfo: () => request("/model/info"),
  getQueueStatus: () => request("/queue/status"),
  getSla: () => request("/queue/sla"),
  getAnalytics: (days = 7) => request(`/admin/analytics?days=${encodeURIComponent(days)}`),
  createToken: (payload) => request("/tokens", { method: "POST", body: JSON.stringify(payload) }),
  cancelToken: (tokenId) => request(`/tokens/${tokenId}/cancel`, { method: "POST" }),
  pauseCounter: (counterId) => request(`/counters/${counterId}/pause`, { method: "PATCH" }),
  resumeCounter: (counterId) => request(`/counters/${counterId}/resume`, { method: "PATCH" }),
  callNext: (counterId) => request(`/admin/call-next/${counterId}`, { method: "POST" }),
  startToken: (counterId, tokenId) =>
    request(`/admin/start-token/${counterId}/${tokenId}`, { method: "POST" }),
  completeToken: (counterId, tokenId) =>
    request(`/admin/complete-token/${counterId}/${tokenId}`, { method: "POST" }),
  missToken: (counterId, tokenId) =>
    request(`/admin/miss-token/${counterId}/${tokenId}`, { method: "POST" }),
  recalculatePredictions: () => request("/admin/recalculate-predictions", { method: "POST" }),
  simulateDelay: (tokenId, extraMinutes = 15) =>
    request(`/admin/demo/simulate-delay/${tokenId}?extra_minutes=${extraMinutes}`, { method: "POST" }),
  seedDemo: () => request("/admin/demo/seed", { method: "POST" }),
  resetDemo: async () => {
    try {
      return await request("/admin/demo/reset", { method: "POST" });
    } catch (error) {
      if (error.status !== 404) throw error;
      return request("/admin/demo/seed", { method: "POST" });
    }
  },
};

export { API_BASE_URL, describeError, setStaffKey };
