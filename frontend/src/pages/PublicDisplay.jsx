import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Maximize2, MonitorUp, RefreshCcw, Ticket, Volume2 } from "lucide-react";
import { API_BASE_URL, api } from "../api.js";

const POLL_INTERVAL_MS = 4000;

const TOKEN_STATUS_LABELS = {
  called: "Called to Counter",
  serving: "Being Served",
  waiting: "Waiting",
  paused: "Paused",
};

function formatTime(value) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMinutes(value) {
  if (value == null) return "-";
  return `${Math.round(value)} min`;
}

function serviceName(servicesById, serviceId) {
  return servicesById.get(serviceId)?.name || "Service";
}

function buildTokenMap(queue) {
  const tokens = [...(queue?.called || []), ...(queue?.now_serving || []), ...(queue?.waiting || [])];
  return new Map(tokens.map((token) => [token.id, token]));
}

function DisplayStatus({ status }) {
  return <span className={`status-badge status-${status || "unknown"}`}>{TOKEN_STATUS_LABELS[status] || status}</span>;
}

export default function PublicDisplay() {
  const [queue, setQueue] = useState(null);
  const [services, setServices] = useState([]);
  const [counters, setCounters] = useState([]);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreenMessage, setFullscreenMessage] = useState("");
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const previousActiveIds = useRef(null);

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const activeTokens = useMemo(() => [...(queue?.called || []), ...(queue?.now_serving || [])], [queue]);
  const waitingTokens = useMemo(() => (queue?.waiting || []).slice(0, 8), [queue]);
  const tokensById = useMemo(() => buildTokenMap(queue), [queue]);

  const loadDisplay = useCallback(async () => {
    try {
      const [queueData, serviceData, counterData] = await Promise.all([
        api.getQueueStatus(),
        api.getServices(),
        api.getCounters(),
      ]);
      setQueue(queueData);
      setServices(serviceData);
      setCounters(counterData);
      setLastUpdated(new Date());
      setError("");
    } catch (displayError) {
      setError(displayError.message || "Could not load public display.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDisplay();
  }, [loadDisplay]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const poller = window.setInterval(loadDisplay, POLL_INTERVAL_MS);
    return () => window.clearInterval(poller);
  }, [loadDisplay]);

  useEffect(() => {
    const activeKeys = new Set(activeTokens.map((token) => `${token.id}:${token.status}`));
    if (previousActiveIds.current) {
      const changedTokenIds = activeTokens
        .filter((token) => !previousActiveIds.current.has(`${token.id}:${token.status}`))
        .map((token) => token.id);
      if (changedTokenIds.length) {
        setHighlightedIds(new Set(changedTokenIds));
        playSafeBeep();
        const clearTimer = window.setTimeout(() => setHighlightedIds(new Set()), 3200);
        previousActiveIds.current = activeKeys;
        return () => window.clearTimeout(clearTimer);
      }
    }
    previousActiveIds.current = activeKeys;
  }, [activeTokens]);

  async function enterFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreenMessage("Fullscreen closed.");
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreenMessage("Fullscreen mode active.");
      } else {
        setFullscreenMessage("Fullscreen is not supported in this browser.");
      }
    } catch {
      setFullscreenMessage("Fullscreen was blocked by the browser.");
    }
  }

  function playSafeBeep() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 660;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
    } catch {
      // Browsers may block audio until the display has a user gesture.
    }
  }

  if (loading) {
    return (
      <main className="display-shell">
        <section className="loading-panel" aria-busy="true">
          <RefreshCcw className="spin" size={28} aria-hidden="true" />
          <h1>Loading Public Display</h1>
          <p>Connecting to {API_BASE_URL}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="display-shell">
      <header className="display-header">
        <div>
          <p className="eyebrow">QueueFlow AI Public Display</p>
          <h1>Service Office Queue</h1>
        </div>
        <div className="display-header-actions">
          <button className="action-button secondary" type="button" onClick={enterFullscreen} data-testid="display-fullscreen">
            <Maximize2 size={16} aria-hidden="true" />
            <span>Fullscreen</span>
          </button>
          <div className="display-clock">
            <Clock3 size={22} aria-hidden="true" />
            <span>{formatTime(now.toISOString())}</span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="message-bar error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="display-message">
        <MonitorUp size={28} aria-hidden="true" />
        <strong>Please proceed only when your token is called.</strong>
        <span className="display-office-status">Office status: Open and serving</span>
      </section>
      {fullscreenMessage ? <div className="display-mode-note" role="status">{fullscreenMessage}</div> : null}

      <section className="display-summary-grid" aria-label="Queue summary">
        <article>
          <span>Now serving</span>
          <strong>{queue?.now_serving?.length ?? 0}</strong>
        </article>
        <article>
          <span>Called</span>
          <strong>{queue?.called?.length ?? 0}</strong>
        </article>
        <article>
          <span>Waiting citizens</span>
          <strong>{queue?.waiting?.length ?? 0}</strong>
        </article>
        <article className="display-average-wait" data-testid="display-average-wait">
          <span>Average wait</span>
          <strong>{formatMinutes(queue?.average_wait_minutes)}</strong>
        </article>
      </section>

      <section className="display-grid">
        <section className="panel display-now-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Live counters</p>
              <h2>Now Serving</h2>
            </div>
          </div>

          <div className="display-now-grid">
            {counters.map((counter) => {
              const token = counter.current_token_id ? tokensById.get(counter.current_token_id) : null;
              const isPublicToken = token && ["called", "serving"].includes(token.status);
              const displayState = isPublicToken ? token.status : counter.status === "paused" ? "paused" : "ready";

              return (
                <article
                  className={`display-counter-card display-counter-${displayState} ${
                    isPublicToken && highlightedIds.has(token.id) ? "is-new-token" : ""
                  }`}
                  key={counter.id}
                >
                  <span>{counter.name}</span>
                  {isPublicToken ? (
                    <>
                      <strong>{token.token_number}</strong>
                      <DisplayStatus status={token.status} />
                      <p>{serviceName(servicesById, token.service_id)}</p>
                    </>
                  ) : counter.status === "paused" ? (
                    <>
                      <strong>Paused</strong>
                      <DisplayStatus status="paused" />
                      <p>This counter is temporarily unavailable.</p>
                    </>
                  ) : (
                    <>
                      <strong>Ready</strong>
                      <p>No token called at this counter.</p>
                    </>
                  )}
                </article>
              );
            })}
          </div>

          {!activeTokens.length ? <div className="empty-state compact">No tokens are being served right now.</div> : null}
        </section>

        <section className="panel display-next-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Upcoming</p>
              <h2>Next Tokens</h2>
            </div>
            <span className="table-count">{waitingTokens.length} shown</span>
          </div>

          <div className="display-next-list">
            {waitingTokens.map((token) => (
              <article className="display-next-token" key={token.id}>
                <div>
                  <span>{token.token_number}</span>
                  <strong>{serviceName(servicesById, token.service_id)}</strong>
                </div>
                <dl>
                  <div>
                    <dt>People ahead</dt>
                    <dd>{token.people_ahead ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Estimated</dt>
                    <dd>{formatTime(token.estimated_service_time)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {!waitingTokens.length ? <div className="empty-state compact">No waiting tokens.</div> : null}
        </section>
      </section>

      <footer className="display-footer">
        <Ticket size={20} aria-hidden="true" />
        <span>
          Keep your token visible. Last updated {lastUpdated ? formatTime(lastUpdated.toISOString()) : "Pending"}.
        </span>
        <Volume2 size={20} aria-hidden="true" />
      </footer>
    </main>
  );
}
