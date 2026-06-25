import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Pause,
  Play,
  RefreshCcw,
  RotateCw,
  TimerReset,
  UserPlus,
  Users,
} from "lucide-react";
import { API_BASE_URL, api } from "../api.js";
import useVisiblePolling from "../useVisiblePolling.js";

const POLL_INTERVAL_MS = 4000;

const TOKEN_STATUS_LABELS = {
  waiting: "Waiting",
  called: "Called to Counter",
  serving: "Being Served",
  completed: "Completed",
  missed: "No-show",
};

const COUNTER_STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
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

function minutesBetween(start, end = new Date()) {
  if (!start) return 0;
  return Math.max(0, Math.floor((end.getTime() - new Date(start).getTime()) / 60000));
}

function minutesMovedLater(before, after) {
  if (!before || !after) return 0;
  return Math.max(0, Math.round((new Date(after).getTime() - new Date(before).getTime()) / 60000));
}

function predictionDeltaText(previousToken, updatedToken) {
  if (!previousToken || !updatedToken) return "";
  const serviceDelta = minutesMovedLater(
    previousToken.estimated_service_time,
    updatedToken.estimated_service_time
  );
  const arrivalDelta = minutesMovedLater(
    previousToken.recommended_arrival_time,
    updatedToken.recommended_arrival_time
  );
  const parts = [];
  if (serviceDelta) parts.push(`Estimated service moved +${serviceDelta} min`);
  if (arrivalDelta) parts.push(`Arrival moved +${arrivalDelta} min`);
  return parts.join(". ");
}

function serviceName(servicesById, serviceId) {
  return servicesById.get(serviceId)?.name || "Unknown service";
}

function expectedDuration(servicesById, token) {
  return servicesById.get(token?.service_id)?.default_duration_minutes || 0;
}

function delayMinutes(servicesById, token, now) {
  if (!token?.started_at) return 0;
  return Math.max(0, minutesBetween(token.started_at, now) - expectedDuration(servicesById, token));
}

function waitingGuidance(token, now) {
  if (!token?.recommended_arrival_time) return "Prediction updated";
  const minutes = Math.ceil((new Date(token.recommended_arrival_time).getTime() - now.getTime()) / 60000);
  if (minutes > 30) return "Not time to arrive yet";
  if (minutes > 15) return "Wait nearby";
  if (minutes >= 0) return "Arrive soon";
  return "Prediction updated";
}

function buildTokenMap(queue, allTokens) {
  const map = new Map();
  [...(queue?.now_serving || []), ...(queue?.called || []), ...(queue?.waiting || []), ...(allTokens || [])].forEach(
    (token) => map.set(token.id, token)
  );
  return map;
}

function getTokenForCounter(tokensById, counter) {
  return counter.current_token_id ? tokensById.get(counter.current_token_id) : null;
}

function sortById(tokens) {
  return [...tokens].sort((a, b) => a.id - b.id);
}

function labelForStatus(status, type = "token") {
  const labels = type === "counter" ? COUNTER_STATUS_LABELS : TOKEN_STATUS_LABELS;
  return labels[status] || status || "Unknown";
}

function StatusBadge({ status, type = "token" }) {
  return <span className={`status-badge status-${status || "unknown"}`}>{labelForStatus(status, type)}</span>;
}

function ActionButton({ children, icon: Icon, variant = "primary", busy, locked, ...props }) {
  return (
    <button {...props} className={`action-button ${variant}`} disabled={busy || locked || props.disabled}>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{busy ? "Working..." : children}</span>
    </button>
  );
}

export default function AdminDashboard() {
  const [queue, setQueue] = useState(null);
  const [services, setServices] = useState([]);
  const [counters, setCounters] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState("");
  const [message, setMessage] = useState({ type: "info", text: "Dashboard ready." });
  const [backendConnected, setBackendConnected] = useState(false);
  const [lastPredictionEvent, setLastPredictionEvent] = useState("");

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const tokensById = useMemo(() => buildTokenMap(queue, tokens), [queue, tokens]);
  const waitingTokens = useMemo(() => sortById(queue?.waiting || []), [queue]);
  const calledTokens = useMemo(() => sortById(queue?.called || []), [queue]);
  const servingTokens = useMemo(() => sortById(queue?.now_serving || []), [queue]);
  const nextWaitingToken = waitingTokens[0] || null;
  const actionLocked = Boolean(actionKey);

  const fetchDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const [, queueData, serviceData, counterData, tokenData] = await Promise.all([
        api.health(),
        api.getQueueStatus(),
        api.getServices(),
        api.getCounters(),
        api.getTokens(),
      ]);
      setBackendConnected(true);
      setQueue(queueData);
      setServices(serviceData);
      setCounters(counterData);
      setTokens(tokenData);
      setLastUpdated(new Date());
      setLoading(false);
      return { queueData, serviceData, counterData, tokenData };
    } catch (error) {
      setLoading(false);
      setBackendConnected(false);
      setMessage({ type: "error", text: error.message });
      return null;
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useVisiblePolling(() => {
    if (!actionKey) fetchDashboard({ silent: true });
  }, POLL_INTERVAL_MS);

  async function runAction(key, pendingText, action, successText, options = {}) {
    setActionKey(key);
    setMessage({ type: "info", text: `${pendingText}...` });
    try {
      await action();
      try {
        await api.recalculatePredictions();
      } catch {
        // Recalculation is a best-effort refresh helper after mutations.
      }
      const refreshed = await fetchDashboard();
      const finalMessage = successText || `${pendingText} completed.`;
      setMessage({ type: "success", text: finalMessage });
      if (key.startsWith("delay-") || key === "recalculate") {
        const updatedToken = refreshed?.queueData?.waiting?.find(
          (token) => token.id === options.predictionTokenSnapshot?.id
        );
        const deltaText = predictionDeltaText(options.predictionTokenSnapshot, updatedToken);
        setLastPredictionEvent(deltaText || "Prediction updated. Citizen arrival time adjusted.");
      } else if (key === "reset") {
        setLastPredictionEvent("");
      }
    } catch (error) {
      await fetchDashboard({ silent: true });
      setMessage({ type: "error", text: error.message });
    } finally {
      setActionKey("");
    }
  }

  function addRandomToken() {
    if (!services.length) {
      throw new Error("No services are available for token creation");
    }
    const service = services[Math.floor(Math.random() * services.length)];
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return api.createToken({
      citizen_name: `Demo Citizen ${suffix}`,
      nic_or_phone: `077${Math.floor(1000000 + Math.random() * 9000000)}`,
      service_id: service.id,
    });
  }

  function handleResetDemo() {
    const confirmed = window.confirm("Reset demo data? This will clear current demo queue state.");
    if (!confirmed) return;
    runAction("reset", "Reset demo data", () => api.resetDemo());
  }

  function renderCounterActions(counter, currentToken) {
    if (counter.status === "paused") {
      return (
        <ActionButton
          icon={Play}
          busy={actionKey === `resume-${counter.id}`}
          locked={actionLocked}
          onClick={() => runAction(`resume-${counter.id}`, `Resume ${counter.name}`, () => api.resumeCounter(counter.id))}
        >
          Resume
        </ActionButton>
      );
    }

    if (!currentToken) {
      const noWaitingCitizens = waitingTokens.length === 0;
      return (
        <>
          <ActionButton
            icon={RotateCw}
            busy={actionKey === `call-${counter.id}`}
            locked={actionLocked}
            disabled={noWaitingCitizens}
            onClick={() => runAction(`call-${counter.id}`, `Call next at ${counter.name}`, () => api.callNext(counter.id))}
          >
            {noWaitingCitizens ? "No Waiting Citizens" : "Call Next"}
          </ActionButton>
          <ActionButton
            icon={Pause}
            variant="secondary"
            busy={actionKey === `pause-${counter.id}`}
            locked={actionLocked}
            onClick={() => runAction(`pause-${counter.id}`, `Pause ${counter.name}`, () => api.pauseCounter(counter.id))}
          >
            Pause
          </ActionButton>
        </>
      );
    }

    if (currentToken.status === "called") {
      return (
        <>
          <ActionButton
            icon={Play}
            busy={actionKey === `start-${currentToken.id}`}
            locked={actionLocked}
            onClick={() =>
              runAction(`start-${currentToken.id}`, `Start ${currentToken.token_number}`, () =>
                api.startToken(counter.id, currentToken.id)
              )
            }
          >
            Start Serving
          </ActionButton>
          <ActionButton
            icon={AlertTriangle}
            variant="danger"
            busy={actionKey === `no-show-${currentToken.id}`}
            locked={actionLocked}
            onClick={() =>
              runAction(
                `no-show-${currentToken.id}`,
                `Mark ${currentToken.token_number} no-show`,
                () => api.missToken(counter.id, currentToken.id),
                `${currentToken.token_number} marked No-show.`
              )
            }
          >
            Mark No-show
          </ActionButton>
        </>
      );
    }

    if (currentToken.status === "serving") {
      return (
        <>
          <ActionButton
            icon={CheckCircle2}
            busy={actionKey === `complete-${currentToken.id}`}
            locked={actionLocked}
            onClick={() =>
              runAction(`complete-${currentToken.id}`, `Complete ${currentToken.token_number}`, () =>
                api.completeToken(counter.id, currentToken.id)
              )
            }
          >
            Complete
          </ActionButton>
          <ActionButton
            icon={TimerReset}
            variant="secondary"
            busy={actionKey === `delay-5-${currentToken.id}`}
            locked={actionLocked}
            onClick={() =>
              runAction(
                `delay-5-${currentToken.id}`,
                `Simulate +5 minute delay for ${currentToken.token_number}`,
                () => api.simulateDelay(currentToken.id, 5),
                "Prediction updated. Citizen arrival time adjusted.",
                { predictionTokenSnapshot: nextWaitingToken }
              )
            }
          >
            Simulate +5 Delay
          </ActionButton>
          <ActionButton
            icon={TimerReset}
            variant="secondary"
            busy={actionKey === `delay-10-${currentToken.id}`}
            locked={actionLocked}
            onClick={() =>
              runAction(
                `delay-10-${currentToken.id}`,
                `Simulate +10 minute delay for ${currentToken.token_number}`,
                () => api.simulateDelay(currentToken.id, 10),
                "Prediction updated. Citizen arrival time adjusted.",
                { predictionTokenSnapshot: nextWaitingToken }
              )
            }
          >
            Simulate +10 Delay
          </ActionButton>
        </>
      );
    }

    return null;
  }

  const overviewCards = [
    { label: "Waiting Citizens", value: waitingTokens.length, icon: Users },
    { label: "Called to Counter", value: calledTokens.length, icon: Activity },
    { label: "Being Served", value: servingTokens.length, icon: Activity },
    { label: "Active Counters", value: queue?.active_counters || 0, icon: CheckCircle2 },
    { label: "No-shows", value: queue?.missed_count || 0, icon: AlertTriangle },
    { label: "Completed", value: queue?.completed_count || 0, icon: CheckCircle2 },
  ];

  const demoHealthItems = [
    { label: "Backend connected", ready: backendConnected },
    { label: "Demo data ready", ready: services.length > 0 && counters.length > 0 && tokens.length > 0 },
    { label: "Active counters available", ready: counters.some((counter) => counter.status === "active") },
    { label: "Waiting citizens available", ready: waitingTokens.length > 0 },
    {
      label: "Prediction engine active",
      ready: Boolean(nextWaitingToken?.estimated_service_time && nextWaitingToken?.recommended_arrival_time),
    },
  ];
  const noActiveCounters = counters.length > 0 && !counters.some((counter) => counter.status === "active");

  if (loading) {
    return (
      <main className="dashboard-shell">
        <section className="loading-panel" aria-busy="true">
          <RefreshCcw className="spin" size={28} aria-hidden="true" />
          <h1>Loading QueueFlow AI</h1>
          <p>Connecting to {API_BASE_URL}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">QueueFlow AI · Operations</p>
          <h1>Predictive Queue Control Center</h1>
          <p className="page-subtitle">Live counters, arrival predictions, and demo controls in one place.</p>
        </div>
        <div className="topbar-meta">
          <span className="clock-pill">
            <Clock3 size={16} aria-hidden="true" />
            {formatDateTime(now.toISOString())}
          </span>
          <span className="api-pill">API {API_BASE_URL}</span>
          <ActionButton icon={RefreshCcw} variant="secondary" busy={refreshing} onClick={() => fetchDashboard()}>
            Refresh
          </ActionButton>
          <ActionButton
            icon={RotateCw}
            variant="secondary"
            busy={actionKey === "reset"}
            locked={actionLocked}
            onClick={handleResetDemo}
          >
            Reset Demo Data
          </ActionButton>
        </div>
      </header>

      <div className={`message-bar ${message.type}`} role="status" aria-live="polite">
        {message.text}
      </div>

      <section className="overview-grid" aria-label="Queue overview">
        {overviewCards.map(({ label, value, icon: Icon }) => (
          <article className="metric-card" key={label}>
            <span className="metric-icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <section className="panel counter-operations-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Active Counters</p>
              <h2>Counter Workflow</h2>
            </div>
          </div>
          <div className="counter-grid">
            {counters.map((counter) => {
              const currentToken = getTokenForCounter(tokensById, counter);
              const serviceLabel = currentToken ? serviceName(servicesById, currentToken.service_id) : "";
              const expected = expectedDuration(servicesById, currentToken);
              const elapsed = minutesBetween(currentToken?.started_at, now);
              const delayedBy = delayMinutes(servicesById, currentToken, now);

              const deskState =
                counter.status === "paused"
                  ? ""
                  : delayedBy
                    ? "is-delayed"
                    : currentToken?.status === "serving"
                      ? "has-serving"
                      : currentToken?.status === "called"
                        ? "has-called"
                        : "";

              return (
                <article className={`counter-card counter-state-${counter.status} ${deskState}`} key={counter.id}>
                  <div className="counter-title">
                    <div>
                      <h3>
                        <span className="led" aria-hidden="true" />
                        {counter.name}
                      </h3>
                      <StatusBadge status={counter.status} type="counter" />
                    </div>
                    <span className="counter-token">{currentToken?.token_number || "—"}</span>
                  </div>

                  {counter.status === "paused" ? (
                    <div className="counter-state-block">
                      <strong>Paused</strong>
                      <p>This counter is not calling citizens. Resume before calling the next waiting citizen.</p>
                    </div>
                  ) : null}

                  {counter.status !== "paused" && !currentToken ? (
                    <div className="counter-state-block">
                      <strong>Ready for next citizen</strong>
                      <p>Call the next waiting citizen when this counter is free.</p>
                    </div>
                  ) : null}

                  {counter.status !== "paused" && currentToken?.status === "called" ? (
                    <div className="counter-state-block called">
                      <StatusBadge status={currentToken.status} />
                      <strong>{currentToken.token_number}</strong>
                      <p>{currentToken.citizen_name || "Unnamed citizen"}</p>
                      <p>{serviceLabel}</p>
                      <p>Citizen called to counter. Waiting for arrival.</p>
                    </div>
                  ) : null}

                  {counter.status !== "paused" && currentToken?.status === "serving" ? (
                    <div className="counter-state-block serving">
                      <StatusBadge status={currentToken.status} />
                      <strong>{currentToken.token_number}</strong>
                      <p>{currentToken.citizen_name || "Unnamed citizen"}</p>
                      <p>{serviceLabel}</p>
                      <dl className="counter-service-metrics">
                        <div>
                          <dt>Started</dt>
                          <dd>{formatTime(currentToken.started_at)}</dd>
                        </div>
                        <div>
                          <dt>Elapsed</dt>
                          <dd>{elapsed} min</dd>
                        </div>
                        <div>
                          <dt>Expected</dt>
                          <dd>{expected || "-"} min</dd>
                        </div>
                        <div>
                          <dt>Delay Status</dt>
                          <dd>{delayedBy ? `Delayed by ${delayedBy} min` : "On time"}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}

                  <div className="button-row">{renderCounterActions(counter, currentToken)}</div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="dashboard-side-stack">
          <section className="panel prediction-panel">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Prediction Engine</p>
                <h2>Next Waiting Citizen</h2>
              </div>
            </div>
            {nextWaitingToken ? (
              <>
                <div className="prediction-focus">
                  <span>Selected token</span>
                  <strong>{nextWaitingToken.token_number}</strong>
                  <p>
                    {noActiveCounters
                      ? "Resume a counter to restart reliable arrival predictions."
                      : "Citizen should arrive based on recommended arrival time, not appointment time."}
                  </p>
                </div>
                {lastPredictionEvent ? (
                  <div className="prediction-update-note" role="status">
                    {lastPredictionEvent}
                  </div>
                ) : null}
                <dl className="prediction-detail-list">
                  <div>
                    <dt>People ahead</dt>
                    <dd>{nextWaitingToken.people_ahead ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>Estimated service time</dt>
                    <dd>{formatTime(nextWaitingToken.estimated_service_time)}</dd>
                  </div>
                  <div>
                    <dt>Recommended arrival time</dt>
                    <dd>{formatTime(nextWaitingToken.recommended_arrival_time)}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{lastUpdated ? formatDateTime(lastUpdated.toISOString()) : "Pending"}</dd>
                  </div>
                </dl>
                <div className="flow-rail" aria-label="How the recommended arrival time is produced">
                  <div className="flow-step is-done">
                    <span className="flow-node" aria-hidden="true" />
                    <span className="flow-label">Queue movement</span>
                    <span className="flow-sub">Live positions</span>
                  </div>
                  <div className="flow-step is-done">
                    <span className="flow-node" aria-hidden="true" />
                    <span className="flow-label">Delay detected</span>
                    <span className="flow-sub">Overrun tracked</span>
                  </div>
                  <div className="flow-step is-done">
                    <span className="flow-node" aria-hidden="true" />
                    <span className="flow-label">Prediction updated</span>
                    <span className="flow-sub">Recalculated</span>
                  </div>
                  <div className="flow-step is-active">
                    <span className="flow-node" aria-hidden="true" />
                    <span className="flow-label">Recommended arrival</span>
                    <span className="flow-sub">Sent to citizen</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state compact">No waiting citizens to predict.</div>
            )}
          </section>

          <section className="panel demo-health-panel" data-testid="demo-health-checklist">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Demo Simulator</p>
                <h2>Demo Health Checklist</h2>
              </div>
            </div>
            <ul className="demo-health-list">
              {demoHealthItems.map((item) => (
                <li className={item.ready ? "ready" : "attention"} key={item.label}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                  <strong>{item.ready ? "Ready" : "Check"}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel demo-steps-panel" data-testid="demo-steps">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Demo Simulator</p>
                <h2>Demo Steps</h2>
              </div>
            </div>
            <ol className="demo-steps-list">
              <li>Reset Demo Data</li>
              <li>Book citizen token</li>
              <li>Open citizen status page</li>
              <li>Simulate +10 delay</li>
              <li>Observe recommended arrival update</li>
            </ol>
          </section>
        </aside>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Waiting Citizens</p>
            <h2>Waiting Citizens</h2>
          </div>
          <span className="table-count">{waitingTokens.length} tokens</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Citizen</th>
                <th>Service</th>
                <th>Status</th>
                <th>People Ahead</th>
                <th>Estimated Service</th>
                <th>Recommended Arrival</th>
                <th>Guidance</th>
              </tr>
            </thead>
            <tbody>
              {waitingTokens.map((token) => (
                <tr key={token.id}>
                  <td className="token-cell" data-label="Token">
                    {token.token_number}
                  </td>
                  <td data-label="Citizen">{token.citizen_name || "Unnamed citizen"}</td>
                  <td data-label="Service">{serviceName(servicesById, token.service_id)}</td>
                  <td data-label="Status">
                    <StatusBadge status={token.status} />
                  </td>
                  <td data-label="People Ahead">{token.people_ahead ?? "-"}</td>
                  <td className="time-cell" data-label="Estimated Service">
                    {formatTime(token.estimated_service_time)}
                  </td>
                  <td className="arrival-cell" data-label="Recommended Arrival">
                    {formatTime(token.recommended_arrival_time)}
                  </td>
                  <td data-label="Guidance">
                    <span className="guidance-chip">{waitingGuidance(token, now)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!waitingTokens.length ? <div className="empty-state table-empty">No waiting citizens.</div> : null}
        </div>
      </section>

      <section className="panel demo-panel">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Competition demo</p>
            <h2>Demo Controls</h2>
          </div>
        </div>
        <div className="demo-actions">
          <ActionButton
            icon={RefreshCcw}
            variant="secondary"
            busy={actionKey === "recalculate"}
            locked={actionLocked}
            onClick={() => runAction("recalculate", "Recalculate predictions", () => api.recalculatePredictions())}
          >
            Recalculate Predictions
          </ActionButton>
          <ActionButton
            icon={RotateCw}
            variant="secondary"
            busy={actionKey === "reset"}
            locked={actionLocked}
            onClick={handleResetDemo}
          >
            Reset Demo Data
          </ActionButton>
          <ActionButton
            icon={UserPlus}
            variant="secondary"
            busy={actionKey === "add-token"}
            locked={actionLocked}
            onClick={() => runAction("add-token", "Add random token", addRandomToken)}
          >
            Add Random Token
          </ActionButton>
        </div>
        <p className="demo-note">
          Delay simulation is available only on a counter with a token that is Being Served.
        </p>
      </section>
    </main>
  );
}
