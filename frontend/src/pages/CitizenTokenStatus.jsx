import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, MapPin, RefreshCcw, Ticket, Users } from "lucide-react";
import { api } from "../api.js";

const POLL_INTERVAL_MS = 4000;

const TOKEN_STATUS_LABELS = {
  waiting: "Waiting",
  called: "Called to Counter",
  serving: "Being Served",
  completed: "Completed",
  missed: "No-show",
};

function formatTime(value) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function minutesUntil(value, now = new Date()) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - now.getTime()) / 60000);
}

function serviceName(servicesById, serviceId) {
  return servicesById.get(serviceId)?.name || "Unknown service";
}

function buildGuidance(token, now) {
  if (!token) return { tone: "info", title: "Looking up your token", text: "We are checking the live queue." };

  if (token.status === "called") {
    return {
      tone: "urgent",
      title: "Your token has been called",
      text: "Please proceed to the counter.",
    };
  }
  if (token.status === "serving") {
    return { tone: "success", title: "You are now being served", text: "Your service is currently in progress." };
  }
  if (token.status === "completed") {
    return { tone: "success", title: "Service completed", text: "Your service has been completed." };
  }
  if (token.status === "missed") {
    return {
      tone: "urgent",
      title: "Token marked No-show",
      text: "Your token was marked No-show. Please contact the counter.",
    };
  }

  const minutes = minutesUntil(token.recommended_arrival_time, now);
  if (minutes == null) {
    return {
      tone: "info",
      title: "Prediction pending",
      text: "Your recommended arrival time will appear as the queue updates.",
    };
  }
  if (minutes > 15) {
    return {
      tone: "calm",
      title: "You do not need to arrive yet",
      text: `Recommended arrival time is ${formatTime(token.recommended_arrival_time)}.`,
    };
  }
  if (minutes >= 0) {
    return {
      tone: "soon",
      title: "Please start heading to the office soon",
      text: `Recommended arrival time is ${formatTime(token.recommended_arrival_time)}.`,
    };
  }
  return {
    tone: "soon",
    title: "Please come to the office now",
    text: "Your recommended arrival time has passed.",
  };
}

function queuePosition(queue, token) {
  if (!queue || !token) return token?.people_ahead == null ? "-" : token.people_ahead + 1;
  const futureTokens = [...(queue.called || []), ...(queue.waiting || [])];
  const index = futureTokens.findIndex((item) => item.token_number === token.token_number);
  if (index >= 0) return index + 1;
  if (token.status === "serving") return "Now serving";
  if (token.status === "completed" || token.status === "missed") return "Closed";
  return token.people_ahead == null ? "-" : token.people_ahead + 1;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status || "unknown"}`}>{TOKEN_STATUS_LABELS[status] || status || "unknown"}</span>;
}

export default function CitizenTokenStatus({ tokenNumber }) {
  const [token, setToken] = useState(null);
  const [services, setServices] = useState([]);
  const [queue, setQueue] = useState(null);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const guidance = useMemo(() => buildGuidance(token, now), [now, token]);
  const position = useMemo(() => queuePosition(queue, token), [queue, token]);

  const fetchStatus = useCallback(
    async ({ silent = false } = {}) => {
      if (!tokenNumber) {
        setError("Missing token number.");
        setLoading(false);
        return;
      }
      if (!silent) setRefreshing(true);
      try {
        const [tokenData, serviceData, queueData] = await Promise.all([
          api.getTokenByNumber(tokenNumber.toUpperCase()),
          api.getServices(),
          api.getQueueStatus(),
        ]);
        setToken(tokenData);
        setServices(serviceData);
        setQueue(queueData);
        setLastUpdated(new Date());
        setError("");
      } catch (statusError) {
        setError(statusError.message || "Could not load this token.");
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    },
    [tokenNumber]
  );

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const poller = window.setInterval(() => fetchStatus({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(poller);
  }, [fetchStatus]);

  if (loading) {
    return (
      <main className="citizen-shell">
        <section className="loading-panel" aria-busy="true">
          <RefreshCcw className="spin" size={28} aria-hidden="true" />
          <h1>Loading Token Status</h1>
          <p>Checking {tokenNumber}</p>
        </section>
      </main>
    );
  }

  if (error && !token) {
    return (
      <main className="citizen-shell">
        <section className="status-error-panel">
          <AlertCircle size={28} aria-hidden="true" />
          <h1>Token not found</h1>
          <p>{error}</p>
          <a className="citizen-primary link-button" href="/">
            Book a new token
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="citizen-shell">
      <section className={`guidance-banner ${guidance.tone}`}>
        <div>
          <p className="eyebrow">Arrival guidance</p>
          <h1>{guidance.title}</h1>
          <p>{guidance.text}</p>
        </div>
        <button className="action-button secondary" type="button" onClick={() => fetchStatus()} disabled={refreshing}>
          <RefreshCcw size={16} aria-hidden="true" />
          <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      </section>

      {error ? (
        <div className="citizen-alert error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="token-status-grid">
        <article className="token-main-card">
          <div className="token-card-header">
            <div>
              <p className="section-kicker">Your token</p>
              <strong>{token?.token_number}</strong>
            </div>
            <StatusBadge status={token?.status} />
          </div>
          <dl className="token-detail-list">
            <div>
              <dt>Citizen</dt>
              <dd>{token?.citizen_name || "Unnamed citizen"}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{serviceName(servicesById, token?.service_id)}</dd>
            </div>
            <div>
              <dt>Queue position</dt>
              <dd>{position}</dd>
            </div>
            <div>
              <dt>People ahead</dt>
              <dd>{token?.people_ahead ?? "-"}</dd>
            </div>
          </dl>
        </article>

        <article className="prediction-card primary-prediction">
          <Clock3 size={22} aria-hidden="true" />
          <span>Estimated Service Time</span>
          <strong>{formatTime(token?.estimated_service_time)}</strong>
        </article>
        <article className="prediction-card arrival-prediction">
          <MapPin size={22} aria-hidden="true" />
          <span>Recommended Arrival</span>
          <strong>{formatTime(token?.recommended_arrival_time)}</strong>
        </article>
        <article className="prediction-card">
          <Users size={22} aria-hidden="true" />
          <span>People Ahead</span>
          <strong>{token?.people_ahead ?? "-"}</strong>
        </article>
      </section>

      <section className="citizen-info-row">
        <article className="explanation-panel">
          <Ticket size={22} aria-hidden="true" />
          <div>
            <h2>Live queue updates</h2>
            <p>
              QueueFlow AI continuously recalculates your estimated service time based on queue movement, service
              duration, counter availability, and delays.
            </p>
          </div>
        </article>
        <article className="last-updated-card">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <span>Last updated</span>
            <strong>{lastUpdated ? formatDateTime(lastUpdated.toISOString()) : "Pending"}</strong>
          </div>
        </article>
      </section>
    </main>
  );
}
