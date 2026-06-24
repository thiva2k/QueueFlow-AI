const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

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
    throw error;
  }

  return data;
}

export const api = {
  health: () => request("/health"),
  getServices: () => request("/services"),
  getCounters: () => request("/counters"),
  getTokens: () => request("/tokens"),
  getTokenByNumber: (tokenNumber) => request(`/tokens/by-number/${encodeURIComponent(tokenNumber)}`),
  getQueueStatus: () => request("/queue/status"),
  createToken: (payload) => request("/tokens", { method: "POST", body: JSON.stringify(payload) }),
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

export { API_BASE_URL };
