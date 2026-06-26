import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, MapPin, RefreshCcw, Ticket, Users } from "lucide-react";
import { api } from "../api.js";
import useVisiblePolling from "../useVisiblePolling.js";

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

function minutesMovedLater(before, after) {
  if (!before || !after) return 0;
  return Math.max(0, Math.round((new Date(after).getTime() - new Date(before).getTime()) / 60000));
}

function predictionDeltaText(previousPrediction, nextPrediction) {
  const serviceDelta = minutesMovedLater(previousPrediction?.estimated, nextPrediction?.estimated);
  const arrivalDelta = minutesMovedLater(previousPrediction?.arrival, nextPrediction?.arrival);
  const parts = [];
  if (serviceDelta) parts.push(`Estimated service moved +${serviceDelta} min`);
  if (arrivalDelta) parts.push(`Arrival moved +${arrivalDelta} min`);
  return parts.join(". ");
}

function serviceName(servicesById, serviceId) {
  return servicesById.get(serviceId)?.name || "Unknown service";
}

function buildGuidance(token, now, assignedCounter) {
  if (!token) return { tone: "info", title: "Looking up your token", text: "We are checking the live queue." };

  if (token.status === "called") {
    return {
      tone: "urgent",
      title: "Your token has been called",
      text: `Please proceed to ${assignedCounter?.name || "the assigned counter"}.`,
    };
  }
  if (token.status === "serving") {
    return {
      tone: "success",
      title: "You are now being served",
      text: `Your service is currently in progress${assignedCounter?.name ? ` at ${assignedCounter.name}` : ""}.`,
    };
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

function peopleAheadLabel(token) {
  if (!token) return "-";
  if (token.status === "serving") return "Now serving";
  if (token.status === "completed" || token.status === "missed") return "Closed";
  if (token.status === "called") return "Called";
  return token.people_ahead ?? "-";
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

const PROGRESS_STEPS = ["Waiting", "Called", "Serving", "Completed"];

function TokenProgress({ status }) {
  const activeIndex = { waiting: 0, called: 1, serving: 2, completed: 3 }[status] ?? -1;
  return (
    <div className="token-progress">
      <p className="section-kicker">Token journey</p>
      <div className="flow-rail" aria-label={`Token progress: ${TOKEN_STATUS_LABELS[status] || "waiting"}`}>
        {PROGRESS_STEPS.map((label, index) => {
          const state = index < activeIndex ? "is-done" : index === activeIndex ? "is-active" : "";
          return (
            <div className={`flow-step ${state}`} key={label}>
              <span className="flow-node" aria-hidden="true" />
              <span className="flow-label">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CitizenTokenStatus({ tokenNumber }) {
  const [token, setToken] = useState(null);
  const [services, setServices] = useState([]);
  const [counters, setCounters] = useState([]);
  const [queue, setQueue] = useState(null);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(null);
  const [predictionNotice, setPredictionNotice] = useState("");
  const [predictionFactors, setPredictionFactors] = useState(null);
  const previousPredictionRef = useRef(null);

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const assignedCounter = useMemo(
    () => counters.find((counter) => counter.current_token_id === token?.id) || null,
    [counters, token]
  );
  const guidance = useMemo(() => buildGuidance(token, now, assignedCounter), [assignedCounter, now, token]);
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
        const [tokenData, serviceData, counterData, queueData] = await Promise.all([
          api.getTokenByNumber(tokenNumber.toUpperCase()),
          api.getServices(),
          api.getCounters(),
          api.getQueueStatus(),
        ]);
        const nextPrediction = {
          estimated: tokenData.estimated_service_time,
          arrival: tokenData.recommended_arrival_time,
        };
        const previousPrediction = previousPredictionRef.current;
        if (
          silent &&
          previousPrediction &&
          tokenData.status === "waiting" &&
          (previousPrediction.estimated !== nextPrediction.estimated || previousPrediction.arrival !== nextPrediction.arrival)
        ) {
          setPredictionNotice(predictionDeltaText(previousPrediction, nextPrediction) || "Prediction updated. Citizen arrival time adjusted.");
        }
        previousPredictionRef.current = nextPrediction;
        setToken(tokenData);
        setServices(serviceData);
        setCounters(counterData);
        setQueue(queueData);
        setLastUpdated(new Date());
        setError("");
        setErrorStatus(null);
      } catch (statusError) {
        setError(statusError.message || "Could not load this token.");
        setErrorStatus(statusError.status || null);
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    },
    [tokenNumber]
  );

  useEffect(() => {
    fetchStatus();
    setPredictionNotice("");
    previousPredictionRef.current = null;
  }, [fetchStatus]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useVisiblePolling(() => fetchStatus({ silent: true }), POLL_INTERVAL_MS);

  // Fetch the plain-language reasoning behind this token's recommended time
  // while it is still in the queue.
  useEffect(() => {
    let cancelled = false;
    if (!token?.id || !["waiting", "called", "serving"].includes(token.status)) {
      setPredictionFactors(null);
      return undefined;
    }
    api
      .getTokenPrediction(token.id)
      .then((prediction) => {
        if (!cancelled) setPredictionFactors(prediction);
      })
      .catch(() => {
        if (!cancelled) setPredictionFactors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token?.id, token?.status, lastUpdated]);

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
          <h1>{errorStatus === 404 ? "Token not found" : "Queue status unavailable"}</h1>
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

      {predictionNotice ? (
        <div className="message-bar success citizen-update-notice" role="status" aria-live="polite">
          {predictionNotice}
        </div>
      ) : null}

      <TokenProgress status={token?.status} />

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
              <dd>{peopleAheadLabel(token)}</dd>
            </div>
            <div>
              <dt>Counter</dt>
              <dd>{assignedCounter?.name || (["called", "serving"].includes(token?.status) ? "Assigning counter" : "-")}</dd>
            </div>
          </dl>
        </article>

        <article className="prediction-card primary-prediction" data-testid="token-estimated-service">
          <Clock3 size={22} aria-hidden="true" />
          <span>Estimated Service Time</span>
          <strong>{formatTime(token?.estimated_service_time)}</strong>
        </article>
        <article className="prediction-card arrival-prediction" data-testid="token-recommended-arrival">
          <MapPin size={22} aria-hidden="true" />
          <span>Recommended Arrival</span>
          <strong>{formatTime(token?.recommended_arrival_time)}</strong>
        </article>
        <article className="prediction-card" data-testid="token-people-ahead">
          <Users size={22} aria-hidden="true" />
          <span>People Ahead</span>
          <strong>{peopleAheadLabel(token)}</strong>
        </article>
      </section>

      {predictionFactors?.factors?.length ? (
        <section className="prediction-why citizen-why" aria-label="How your recommended time is calculated">
          <p className="prediction-why-title">How your time is calculated</p>
          <ul>
            {predictionFactors.factors.map((factor, index) => (
              <li key={index}>{factor}</li>
            ))}
          </ul>
        </section>
      ) : null}

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
