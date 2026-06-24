import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, MonitorUp, RefreshCcw, Ticket, Users } from "lucide-react";
import { API_BASE_URL, api } from "../api.js";

const POLL_INTERVAL_MS = 4000;

const TOKEN_STATUS_LABELS = {
  called: "Proceed to Counter",
  serving: "Being Served",
  waiting: "Waiting",
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
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    const poller = window.setInterval(loadDisplay, POLL_INTERVAL_MS);
    return () => window.clearInterval(poller);
  }, [loadDisplay]);

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
        <div className="display-clock">
          <Clock3 size={22} aria-hidden="true" />
          <span>{lastUpdated ? formatTime(lastUpdated.toISOString()) : "Pending"}</span>
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
      </section>

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
        <article className="display-average-wait">
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

              return (
                <article className="display-counter-card" key={counter.id}>
                  <span>{counter.name}</span>
                  {isPublicToken ? (
                    <>
                      <strong>{token.token_number}</strong>
                      <DisplayStatus status={token.status} />
                      <p>{serviceName(servicesById, token.service_id)}</p>
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
        <span>Keep your token visible. Staff will call tokens in order based on counter availability.</span>
        <Users size={20} aria-hidden="true" />
      </footer>
    </main>
  );
}
