import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FlaskConical,
  Lock,
  Pause,
  PhoneCall,
  Play,
  Radio,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Timer,
  TimerReset,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import {
  AnimatedNumber,
  ConfirmDialog,
  EmptyState,
  LiveIndicator,
  PageHeader,
  StatCard,
  StatusChip,
  Toaster,
  useToasts,
} from "../components/index.js";
import SplitFlap from "../components/SplitFlap.jsx";
import { BentoCard, BorderBeam } from "../components/ui/index.js";
import { ICON, LABELS } from "../constants.js";
import { api, describeError, setStaffKey } from "../api.js";
import useVisiblePolling, { useLatestRequest } from "../useVisiblePolling.js";
import "../styles/admin.css";

const POLL_INTERVAL_MS = 4000;
const HISTORY_CAP = 40;
const FEED_CAP = 30;

/* ---------- formatting helpers -------------------------------------------- */

function formatClock(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatClockSeconds(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function roundOrDash(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return String(Math.round(Number(value)));
}

function minutesBetween(start, end) {
  if (!start) return 0;
  return Math.max(0, Math.floor((end.getTime() - new Date(start).getTime()) / 60000));
}

function sortById(list) {
  return [...(list || [])].sort((a, b) => a.id - b.id);
}

function arrivalGuidance(token, now) {
  if (!token?.recommended_arrival_time) return { text: "Estimate pending", tone: "neutral" };
  const mins = Math.ceil((new Date(token.recommended_arrival_time).getTime() - now.getTime()) / 60000);
  if (mins > 30) return { text: "Not time yet", tone: "neutral" };
  if (mins > 15) return { text: "Wait nearby", tone: "predict" };
  if (mins >= 0) return { text: "Arrive soon", tone: "predict" };
  return { text: "Overdue", tone: "warn" };
}

/* ---------- inline sparkline ---------------------------------------------- */

function Sparkline({ values, tone = "live" }) {
  const reduce = useReducedMotion();
  const pts = (values || []).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (pts.length < 2) return null;
  const w = 62;
  const h = 20;
  const pad = 2;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const points = pts
    .map((v, i) => `${(pad + i * step).toFixed(1)},${(pad + (h - pad * 2) * (1 - (v - min) / range)).toFixed(1)}`)
    .join(" ");
  const stroke = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--live)";
  return (
    <svg className="qf-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {/* Path draws in once on mount (≤600ms); static under reduced motion. */}
      <motion.polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0.3 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

/* ---------- staff-key gate ------------------------------------------------- */

function StaffGate({ onSubmit, submitting }) {
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);

  return (
    <main className="qf-shell qf-admin-gate">
      <div className="qf-admin-gate__card">
        <span className="qf-admin-gate__icon" aria-hidden="true">
          <Lock size={ICON.lg} />
        </span>
        <h1 className="qf-admin-gate__title">Staff sign-in required</h1>
        <p className="qf-admin-gate__lead">
          This is the operations dashboard. Enter your staff key to continue.
        </p>
        <form
          className="qf-admin-gate__form"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            onSubmit(value.trim());
          }}
        >
          <label className="qf-admin-gate__label" htmlFor="qf-staff-key">
            Staff key
          </label>
          <input
            id="qf-staff-key"
            className="qf-admin-gate__input mono"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="••••••••"
            aria-describedby={tried ? "qf-staff-key-error" : undefined}
          />
          {tried ? (
            <p id="qf-staff-key-error" className="qf-admin-gate__error" role="alert">
              That key didn't work. Check it and try again.
            </p>
          ) : null}
          <button type="submit" className="qf-btn qf-btn--primary" disabled={submitting || !value.trim()}>
            {submitting ? "Checking…" : "Unlock dashboard"}
          </button>
        </form>
      </div>
    </main>
  );
}

/* ========================================================================== */

export default function AdminDashboard() {
  const { toasts, notify, dismiss } = useToasts();
  const reduce = useReducedMotion();
  const { begin } = useLatestRequest();

  // Staff access probe: "checking" | "granted" | "locked"
  const [access, setAccess] = useState("checking");
  const [unlocking, setUnlocking] = useState(false);

  const [queue, setQueue] = useState(null);
  const [services, setServices] = useState([]);
  const [counters, setCounters] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [sla, setSla] = useState(null);
  const [history, setHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [predictionFactors, setPredictionFactors] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);

  const [now, setNow] = useState(() => new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionKey, setActionKey] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const prevTokensRef = useRef(null);
  const feedSeq = useRef(0);

  const servicesById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const waitingTokens = useMemo(() => sortById(queue?.waiting), [queue]);
  const calledTokens = useMemo(() => sortById(queue?.called), [queue]);
  const servingTokens = useMemo(() => sortById(queue?.now_serving), [queue]);
  const tokensById = useMemo(() => {
    const map = new Map();
    [...servingTokens, ...calledTokens, ...waitingTokens, ...tokens].forEach((t) => map.set(t.id, t));
    return map;
  }, [servingTokens, calledTokens, waitingTokens, tokens]);

  const nextWaitingToken = waitingTokens[0] || null;
  const firstServing = servingTokens[0] || null;

  const serviceName = useCallback(
    (serviceId) => servicesById.get(serviceId)?.name || "Unknown service",
    [servicesById]
  );

  /* ---- staff access probe ---- */
  const probeAccess = useCallback(async () => {
    try {
      await api.getAnalytics(1);
      setAccess("granted");
      return true;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setAccess("locked");
        return false;
      }
      // A non-auth failure (server down / transient) shouldn't lock the operator
      // out — let the dashboard load and surface its own inline error.
      setAccess("granted");
      return true;
    }
  }, []);

  useEffect(() => {
    probeAccess();
  }, [probeAccess]);

  const handleUnlock = useCallback(
    async (key) => {
      setUnlocking(true);
      setStaffKey(key);
      const ok = await probeAccess();
      setUnlocking(false);
      if (ok) notify("Staff key accepted.", { variant: "success" });
    },
    [probeAccess, notify]
  );

  /* ---- activity feed diff ---- */
  const recordActivity = useCallback((currentTokens, counterList) => {
    const prev = prevTokensRef.current;
    prevTokensRef.current = currentTokens;
    if (!prev) return; // don't flood the feed on first load

    const counterByToken = new Map((counterList || []).map((c) => [c.current_token_id, c.name]));
    const prevMap = new Map(prev.map((t) => [t.id, t]));
    const events = [];
    const push = (token, text, tone) => {
      events.push({
        id: `evt-${(feedSeq.current += 1)}`,
        token: token.token_number,
        text,
        tone,
        ts: Date.now(),
      });
    };

    for (const t of currentTokens) {
      const p = prevMap.get(t.id);
      const at = counterByToken.get(t.id);
      const where = at ? ` to ${at}` : "";
      if (!p) {
        if (t.status === "waiting") push(t, "joined the queue", "neutral");
        continue;
      }
      if (p.status === t.status) continue;
      if (t.status === "called") push(t, `called${where}`, "live");
      else if (t.status === "serving") push(t, `now being served${at ? ` at ${at}` : ""}`, "live");
      else if (t.status === "completed") push(t, "completed", "ok");
      else if (t.status === "missed") push(t, "marked no-show", "danger");
      else if (t.status === "cancelled") push(t, "cancelled", "neutral");
    }

    if (events.length) {
      events.reverse(); // newest first within this batch
      setActivity((list) => [...events, ...list].slice(0, FEED_CAP));
    }
  }, []);

  /* ---- main fetch: primary independent, secondary via allSettled ---- */
  const fetchDashboard = useCallback(async () => {
    const req = begin();

    let queueData;
    try {
      queueData = await api.getStaffQueue();
    } catch (error) {
      if (!req.isCurrent()) return;
      setLoadError(describeError(error));
      setLoading(false);
      return;
    }
    if (!req.isCurrent()) return;
    setQueue(queueData);
    setLoadError(null);

    const [servicesR, countersR, tokensR, slaR] = await Promise.allSettled([
      api.getServices(),
      api.getCounters(),
      api.getStaffTokens(),
      api.getSla(),
    ]);
    if (!req.isCurrent()) return;

    if (servicesR.status === "fulfilled") setServices(servicesR.value);
    const counterList = countersR.status === "fulfilled" ? countersR.value : counters;
    if (countersR.status === "fulfilled") setCounters(countersR.value);
    if (tokensR.status === "fulfilled") {
      setTokens(tokensR.value);
      recordActivity(tokensR.value, counterList);
    }
    if (slaR.status === "fulfilled") setSla(slaR.value);

    setHistory((h) =>
      [
        ...h,
        {
          waiting: queueData.waiting?.length ?? 0,
          called: queueData.called?.length ?? 0,
          serving: queueData.now_serving?.length ?? 0,
          completed: queueData.completed_count ?? 0,
          avg: queueData.average_service_duration ?? 0,
          counters: queueData.active_counters ?? 0,
        },
      ].slice(-HISTORY_CAP)
    );

    setLastUpdated(new Date());
    setLoading(false);
  }, [begin, counters, recordActivity]);

  useEffect(() => {
    if (access === "granted") fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  useEffect(() => {
    api
      .getModelInfo()
      .then(setModelInfo)
      .catch(() => setModelInfo(null));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useVisiblePolling(
    () => {
      if (access === "granted" && !actionKey) fetchDashboard();
    },
    POLL_INTERVAL_MS,
    access === "granted"
  );

  // Live reasoning behind the next citizen's recommended arrival.
  useEffect(() => {
    let cancelled = false;
    if (!nextWaitingToken?.id) {
      setPredictionFactors(null);
      return undefined;
    }
    api
      .getTokenPrediction(nextWaitingToken.id)
      .then((prediction) => {
        if (!cancelled) setPredictionFactors(prediction);
      })
      .catch(() => {
        if (!cancelled) setPredictionFactors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [nextWaitingToken?.id, lastUpdated]);

  /* ---- action runner (per-action loading + toasts) ---- */
  const runAction = useCallback(
    async (key, fn, successMsg) => {
      setActionKey(key);
      try {
        await fn();
        await fetchDashboard();
        if (successMsg) notify(successMsg, { variant: "success" });
      } catch (error) {
        notify(describeError(error), { variant: "error" });
        fetchDashboard();
      } finally {
        setActionKey("");
      }
    },
    [fetchDashboard, notify]
  );

  const handleReset = useCallback(async () => {
    setActionKey("reset");
    try {
      await api.resetDemo();
      setActivity([]);
      setHistory([]);
      prevTokensRef.current = null;
      await fetchDashboard();
      notify("Demo data reset.", { variant: "success" });
      setConfirmReset(false);
    } catch (error) {
      notify(describeError(error), { variant: "error" });
    } finally {
      setActionKey("");
    }
  }, [fetchDashboard, notify]);

  const addRandomToken = useCallback(() => {
    if (!services.length) throw new Error("No services are available");
    const service = services[Math.floor(Math.random() * services.length)];
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return api.createToken({
      citizen_name: `Demo Citizen ${suffix}`,
      nic_or_phone: `077${Math.floor(1000000 + Math.random() * 9000000)}`,
      service_id: service.id,
    });
  }, [services]);

  /* ---- render gates ---- */
  if (access === "checking") {
    return (
      <main className="qf-shell qf-admin-probe" aria-busy="true">
        <RefreshCcw className="qf-spin" size={28} aria-hidden="true" />
        <p className="qf-loading-note">Checking staff access…</p>
      </main>
    );
  }

  if (access === "locked") {
    return (
      <>
        <StaffGate onSubmit={handleUnlock} submitting={unlocking} />
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  const rowMotion = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.2, ease: "easeOut" },
      };

  // Page mount: orchestrated stagger — header then panels (spec §4).
  const mountContainer = reduce
    ? {}
    : {
        initial: "hidden",
        animate: "show",
        variants: { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } } },
      };
  const panelReveal = reduce
    ? {}
    : {
        variants: {
          hidden: { opacity: 0, y: 14 },
          show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
        },
      };

  const kpis = [
    { key: "waiting", label: "Waiting", value: waitingTokens.length, tone: "default", icon: <Users size={ICON.sm} /> },
    { key: "called", label: "Called", value: calledTokens.length, tone: "live", icon: <PhoneCall size={ICON.sm} /> },
    { key: "serving", label: "Now serving", value: servingTokens.length, tone: "live", icon: <Radio size={ICON.sm} /> },
    {
      key: "completed",
      label: "Completed",
      value: queue?.completed_count ?? 0,
      tone: "ok",
      icon: <CheckCircle2 size={ICON.sm} />,
    },
    {
      key: "avg",
      label: "Avg service",
      value: queue?.average_service_duration ?? 0,
      unit: "min",
      tone: "default",
      format: roundOrDash,
      icon: <Timer size={ICON.sm} />,
    },
    {
      key: "counters",
      label: "Active counters",
      value: queue?.active_counters ?? 0,
      tone: "default",
      icon: <Building2 size={ICON.sm} />,
    },
  ];

  const slaTone =
    sla?.status === "good" ? "ok" : sla?.status === "warn" ? "warn" : sla?.status === "behind" ? "danger" : "neutral";

  return (
    <main className="qf-shell qf-admin">
      <motion.div className="qf-admin-stack" {...mountContainer}>
      <motion.div {...panelReveal}>
        <PageHeader
          eyebrow="Staff · operations"
          title="QueueFlow AI Control Center"
          subtitle="Live counters, arrival predictions and queue health in one view."
          actions={
            <div className="qf-admin-headmeta">
              <span className="qf-admin-clock mono">{formatClockSeconds(now)}</span>
              <LiveIndicator updatedAt={lastUpdated} active={!actionKey} />
            </div>
          }
        />
      </motion.div>

      {loadError ? (
        <div className="qf-admin-alert" role="alert">
          <XCircle size={ICON.md} aria-hidden="true" />
          <span>{loadError}</span>
          <button type="button" className="qf-btn qf-btn--ghost qf-admin-alert__retry" onClick={() => fetchDashboard()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* KPI row */}
      <motion.section className="qf-admin-kpis" aria-label="Queue overview" {...panelReveal}>
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.key}
            label={kpi.label}
            icon={kpi.icon}
            tone={kpi.tone}
            unit={kpi.unit}
            value={<AnimatedNumber value={kpi.value} format={kpi.format} />}
            sparkline={<Sparkline values={history.map((h) => h[kpi.key])} tone={kpi.tone === "ok" ? "ok" : "live"} />}
          />
        ))}
      </motion.section>

      {/* SLA row */}
      <motion.section className="qf-admin-sla" aria-label="Service level" {...panelReveal}>
        <span className={`qf-admin-sla__badge qf-admin-sla__badge--${slaTone}`}>
          <ShieldCheck size={ICON.sm} aria-hidden="true" />
          {sla == null ? (
            "On-time performance —"
          ) : sla.status === "unknown" || sla.on_time_percent == null ? (
            "On-time performance not measured yet"
          ) : (
            <>
              <strong className="mono">{sla.on_time_percent}%</strong> on-time
              <span className="qf-admin-sla__sample">(last {sla.sample_size})</span>
            </>
          )}
        </span>
        {sla?.counters_behind?.length ? (
          <div className="qf-admin-sla__behind">
            <span className="qf-admin-sla__behind-label">Running behind:</span>
            {sla.counters_behind.map((name) => (
              <span key={name} className="qf-admin-guide qf-admin-guide--warn">
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </motion.section>

      {/* Counters + activity feed — command bento (spec v4 §6). The single
          amber BorderBeam rides the called counter, else the first serving. */}
      <motion.section className="qf-admin-grid" {...panelReveal}>
        <BentoCard tone="amber" className="qf-admin-panel">
          <div className="qf-admin-panel__head">
            <p className="qf-eyebrow">SEC 01 · COUNTERS</p>
            <h2 className="qf-admin-panel__title">Now serving</h2>
          </div>
          {counters.length ? (
            <div className="qf-admin-counters">
              {counters.map((counter) => {
                const beamCounter =
                  counters.find((c) => tokensById.get(c.current_token_id)?.status === "called") ||
                  counters.find((c) => tokensById.get(c.current_token_id)?.status === "serving");
                return (
                  <CounterCard
                    key={counter.id}
                    counter={counter}
                    token={counter.current_token_id ? tokensById.get(counter.current_token_id) : null}
                    serviceName={serviceName}
                    now={now}
                    actionKey={actionKey}
                    waitingCount={waitingTokens.length}
                    runAction={runAction}
                    beam={beamCounter?.id === counter.id}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<Building2 size={ICON.lg} />}
              title="No counters configured"
              message="Seed the demo data to add service counters."
            />
          )}
        </BentoCard>

        <BentoCard className="qf-admin-panel qf-admin-feed-panel">
          <div className="qf-admin-panel__head">
            <p className="qf-eyebrow">SEC 02 · FEED</p>
            <h2 className="qf-admin-panel__title">Recent events</h2>
          </div>
          {activity.length ? (
            <ul className="qf-admin-feed">
              <AnimatePresence initial={false}>
                {activity.map((event, index) => (
                  <motion.li
                    key={event.id}
                    className="qf-admin-feed__item"
                    {...(reduce
                      ? {}
                      : {
                          initial: { opacity: 0, x: -18 },
                          animate: { opacity: 1, x: 0 },
                          exit: { opacity: 0 },
                          transition: {
                            duration: 0.28,
                            ease: [0.22, 1, 0.36, 1],
                            // Fresh entries land newest-first at the top; stagger them 45ms.
                            delay: Math.min(index, 6) * 0.045,
                          },
                        })}
                  >
                    <span className={`qf-admin-feed__dot qf-admin-feed__dot--${event.tone}`} aria-hidden="true" />
                    <span className="qf-admin-feed__text">
                      <strong className="mono">{event.token}</strong> {event.text}
                    </span>
                    <time className="qf-admin-feed__time mono">{formatClock(event.ts)}</time>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <EmptyState
              compact
              icon={<Activity size={ICON.lg} />}
              title="Waiting for activity"
              message="Counter actions will appear here as they happen."
            />
          )}
        </BentoCard>
      </motion.section>

      {/* Prediction engine console */}
      <motion.section className="qf-bento qf-admin-panel qf-admin-predict" {...panelReveal}>
        <div className="qf-admin-panel__head">
          <p className="qf-eyebrow">SEC 03 · PREDICTION ENGINE</p>
          <h2 className="qf-admin-panel__title">Next citizen&apos;s arrival</h2>
        </div>
        {nextWaitingToken ? (
          <div className="qf-admin-predict__body">
            <div className="qf-admin-predict__focus">
              <span className="qf-eyebrow">Selected token</span>
              <strong className="mono">{nextWaitingToken.token_number}</strong>
              <StatusChip status={nextWaitingToken.status} size="sm" />
            </div>

            {nextWaitingToken.estimated_service_time || nextWaitingToken.recommended_arrival_time ? (
              <dl className="qf-admin-predict__metrics">
                <div>
                  <dt>People ahead</dt>
                  <dd className="mono">{nextWaitingToken.people_ahead ?? "—"}</dd>
                </div>
                <div>
                  <dt>{LABELS.estimatedServiceTime}</dt>
                  <dd className="mono">{formatClock(nextWaitingToken.estimated_service_time)}</dd>
                </div>
                <div>
                  <dt>{LABELS.recommendedArrival}</dt>
                  <dd className="mono">
                    {formatClock(nextWaitingToken.recommended_arrival_time)}
                    {predictionFactors?.confidence_minutes
                      ? ` ± ${Math.round(predictionFactors.confidence_minutes)} min`
                      : ""}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="qf-admin-predict__paused">{LABELS.estimatesPaused}</p>
            )}

            {predictionFactors?.factors?.length ? (
              <div className="qf-admin-console" aria-label="Prediction factors">
                <p className="qf-admin-console__title mono">// why this time</p>
                <ul>
                  {predictionFactors.factors.map((factor, index) => (
                    <li key={index} className="mono">
                      <span aria-hidden="true">›</span> {factor}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {modelInfo?.trained ? (
              <details className="qf-admin-modelmeta">
                <summary>
                  <Cpu size={ICON.sm} aria-hidden="true" />
                  Prediction model calibrated for this office
                  <ChevronRight size={ICON.sm} aria-hidden="true" className="qf-admin-modelmeta__chevron" />
                </summary>
                <div className="qf-admin-console qf-admin-modelmeta__body">
                  <p className="mono">Calibrated on {modelInfo.samples} historical service records.</p>
                  {modelInfo.importances && Object.keys(modelInfo.importances).length ? (
                    <ul>
                      {Object.entries(modelInfo.importances).map(([name, weight]) => (
                        <li key={name} className="mono">
                          {name.replace(/_/g, " ")}: {Math.round(Number(weight) * 100)}%
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mono qf-admin-modelmeta__src">Calibration source: {modelInfo.data_source}</p>
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Users size={ICON.lg} />}
            title="No one waiting"
            message="There are no waiting citizens to predict right now."
          />
        )}
      </motion.section>

      {/* Queue table */}
      <motion.section className="qf-bento qf-admin-panel" {...panelReveal}>
        <div className="qf-admin-panel__head">
          <p className="qf-eyebrow">SEC 04 · QUEUE</p>
          <h2 className="qf-admin-panel__title">Waiting Citizens</h2>
          <span className="qf-admin-panel__count mono">{waitingTokens.length}</span>
        </div>
        {waitingTokens.length ? (
          <div className="qf-admin-tablewrap">
            <table className="qf-admin-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Citizen</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Ahead</th>
                  <th>{LABELS.estimatedServiceTime}</th>
                  <th>{LABELS.recommendedArrival}</th>
                  <th>Guidance</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {waitingTokens.map((token) => {
                    const guide = arrivalGuidance(token, now);
                    return (
                      <motion.tr key={token.id} layout={!reduce} {...rowMotion}>
                        <td className="mono qf-admin-table__token" data-label="Token">
                          {token.token_number}
                        </td>
                        <td data-label="Citizen">{token.citizen_name || "Unnamed citizen"}</td>
                        <td data-label="Service">{serviceName(token.service_id)}</td>
                        <td data-label="Status">
                          <StatusChip status={token.status} size="sm" />
                        </td>
                        <td className="mono" data-label="Ahead">
                          {token.people_ahead ?? "—"}
                        </td>
                        <td className="mono" data-label={LABELS.estimatedServiceTime}>
                          {formatClock(token.estimated_service_time)}
                        </td>
                        <td className="mono" data-label={LABELS.recommendedArrival}>
                          {formatClock(token.recommended_arrival_time)}
                        </td>
                        <td data-label="Guidance">
                          <span className={`qf-admin-guide qf-admin-guide--${guide.tone}`}>{guide.text}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            compact
            icon={<CheckCircle2 size={ICON.lg} />}
            tone="ok"
            title="Queue is clear."
            message="No citizens are waiting right now."
          />
        )}
      </motion.section>

      {/* Demo & simulation drawer — physically separate from real operator actions */}
      <motion.section className="qf-admin-drawer" data-testid="demo-steps" {...panelReveal}>
        <button
          type="button"
          className="qf-admin-drawer__toggle"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <FlaskConical size={ICON.md} aria-hidden="true" />
          <span className="qf-admin-drawer__title">Demo &amp; simulation</span>
          <span className="qf-admin-drawer__tag">demo</span>
          <ChevronRight
            size={ICON.md}
            aria-hidden="true"
            className={`qf-admin-drawer__chevron ${drawerOpen ? "is-open" : ""}`}
          />
        </button>

        {drawerOpen ? (
          <div className="qf-admin-drawer__body">
            <p className="qf-admin-drawer__note">
              These controls only affect demo data. They are not part of live queue operations.
            </p>
            <div className="qf-admin-drawer__actions">
              <button
                type="button"
                className="qf-btn qf-btn--danger"
                disabled={Boolean(actionKey)}
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw size={ICON.sm} aria-hidden="true" />
                Reset demo data
              </button>
              <button
                type="button"
                className="qf-btn qf-btn--secondary"
                disabled={actionKey === "seed" || Boolean(actionKey)}
                onClick={() => runAction("seed", () => api.seedDemo(), "Demo data seeded.")}
              >
                <UserPlus size={ICON.sm} aria-hidden="true" />
                {actionKey === "seed" ? "Seeding…" : "Seed demo data"}
              </button>
              <button
                type="button"
                className="qf-btn qf-btn--secondary"
                disabled={Boolean(actionKey)}
                onClick={() => runAction("recalc", () => api.recalculatePredictions(), "Predictions recalculated.")}
              >
                <RefreshCcw size={ICON.sm} aria-hidden="true" />
                {actionKey === "recalc" ? "Recalculating…" : "Recalculate predictions"}
              </button>
              <button
                type="button"
                className="qf-btn qf-btn--secondary"
                disabled={!firstServing || Boolean(actionKey)}
                title={firstServing ? undefined : "Needs a token that is currently being served"}
                onClick={() =>
                  runAction(
                    "delay-5",
                    () => api.simulateDelay(firstServing.id, 5),
                    "Simulated a 5-minute delay — predictions updated."
                  )
                }
              >
                <TimerReset size={ICON.sm} aria-hidden="true" />
                Simulate +5 delay
              </button>
              <button
                type="button"
                className="qf-btn qf-btn--secondary"
                disabled={!firstServing || Boolean(actionKey)}
                title={firstServing ? undefined : "Needs a token that is currently being served"}
                onClick={() =>
                  runAction(
                    "delay-10",
                    () => api.simulateDelay(firstServing.id, 10),
                    "Simulated a 10-minute delay — predictions updated."
                  )
                }
              >
                <TimerReset size={ICON.sm} aria-hidden="true" />
                Simulate +10 delay
              </button>
              <button
                type="button"
                className="qf-btn qf-btn--secondary"
                disabled={actionKey === "add-token" || Boolean(actionKey)}
                onClick={() => runAction("add-token", addRandomToken, "Added a demo token.")}
              >
                <UserPlus size={ICON.sm} aria-hidden="true" />
                Add random token
              </button>
            </div>

            <ul className="qf-admin-drawer__health" data-testid="demo-health-checklist">
              {[
                { label: "Backend connected", ready: !loadError },
                {
                  label: "Demo data ready",
                  ready: services.length > 0 && counters.length > 0 && tokens.length > 0,
                },
                { label: "Active counters available", ready: counters.some((c) => c.status === "active") },
                { label: "Waiting citizens available", ready: waitingTokens.length > 0 },
                {
                  label: "Prediction engine active",
                  ready: Boolean(nextWaitingToken?.recommended_arrival_time),
                },
              ].map((item) => (
                <li key={item.label} className={item.ready ? "is-ready" : "is-check"}>
                  <CheckCircle2 size={ICON.sm} aria-hidden="true" />
                  <span>{item.label}</span>
                  <strong>{item.ready ? "Ready" : "Check"}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </motion.section>
      </motion.div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        message={`This clears all ${tokens.length} current tokens and reseeds the office. This can't be undone.`}
        confirmLabel="Reset data"
        loading={actionKey === "reset"}
        onCancel={() => setConfirmReset(false)}
        onConfirm={handleReset}
      />

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}

/* ---------- counter control card ------------------------------------------ */

function CounterCard({ counter, token, serviceName, now, actionKey, waitingCount, runAction, beam = false }) {
  const paused = counter.status === "paused";
  const status = token?.status;
  const active = status === "called" || status === "serving";

  let stateClass = "is-idle";
  if (paused) stateClass = "is-paused";
  else if (status === "serving") stateClass = "is-serving";
  else if (status === "called") stateClass = "is-called";

  const elapsed = status === "serving" ? minutesBetween(token.started_at, now) : 0;
  // Amber = the call (counter acting on a citizen); muted dashes when idle/paused.
  const flapTone = active ? "amber" : "muted";
  const flapValue = paused || !token ? "---" : token.token_number;
  const flapLabel = paused ? "Counter paused" : token ? `Token ${token.token_number}` : "No token";

  return (
    <article className={`qf-admin-counter relative ${stateClass}`}>
      {beam ? (
        <BorderBeam size={110} duration={7} colorFrom="var(--amber)" colorTo="var(--live)" />
      ) : null}
      <header className="qf-admin-counter__head">
        <span className="qf-admin-counter__name">
          <span className="qf-admin-counter__led" aria-hidden="true" />
          {counter.name}
        </span>
        {paused ? (
          <span className="qf-admin-counter__paused">Paused</span>
        ) : token ? (
          <StatusChip status={token.status} size="sm" />
        ) : null}
      </header>

      <div className="qf-admin-counter__flap">
        <SplitFlap size="md" tone={flapTone} value={flapValue} label={flapLabel} />
      </div>

      {paused ? (
        <p className="qf-admin-counter__body">
          This counter is closed. Resume it before calling the next citizen.
        </p>
      ) : token ? (
        <div className="qf-admin-counter__current">
          <p className="qf-admin-counter__citizen">{token.citizen_name || "Unnamed citizen"}</p>
          <p className="qf-admin-counter__service">{serviceName(token.service_id)}</p>
          {status === "serving" ? <p className="qf-admin-counter__meta mono">Elapsed {elapsed} min</p> : null}
          {status === "called" && typeof token.no_show_risk === "number" ? (
            <span
              className={`qf-admin-guide qf-admin-guide--${
                token.no_show_risk >= 50 ? "warn" : "neutral"
              }`}
            >
              No-show risk {token.no_show_risk}%
            </span>
          ) : null}
        </div>
      ) : (
        <p className="qf-admin-counter__body">Ready for next citizen</p>
      )}

      <div className="qf-admin-counter__actions">
        {paused ? (
          <button
            type="button"
            className="qf-btn qf-btn--primary"
            disabled={Boolean(actionKey)}
            onClick={() => runAction(`resume-${counter.id}`, () => api.resumeCounter(counter.id), `${counter.name} resumed.`)}
          >
            <Play size={ICON.sm} aria-hidden="true" />
            {actionKey === `resume-${counter.id}` ? "Working…" : "Resume"}
          </button>
        ) : null}

        {!paused && !token ? (
          <>
            <button
              type="button"
              className="qf-btn qf-btn--primary"
              disabled={waitingCount === 0 || Boolean(actionKey)}
              onClick={() =>
                runAction(`call-${counter.id}`, () => api.callNext(counter.id), `Called next at ${counter.name}.`)
              }
            >
              <SkipForward size={ICON.sm} aria-hidden="true" />
              {waitingCount === 0 ? "No one waiting" : actionKey === `call-${counter.id}` ? "Working…" : "Call Next"}
            </button>
            <button
              type="button"
              className="qf-btn qf-btn--secondary"
              disabled={Boolean(actionKey)}
              onClick={() => runAction(`pause-${counter.id}`, () => api.pauseCounter(counter.id), `${counter.name} paused.`)}
            >
              <Pause size={ICON.sm} aria-hidden="true" />
              Pause
            </button>
          </>
        ) : null}

        {!paused && status === "called" ? (
          <>
            <button
              type="button"
              className="qf-btn qf-btn--primary"
              disabled={Boolean(actionKey)}
              onClick={() =>
                runAction(
                  `start-${token.id}`,
                  () => api.startToken(counter.id, token.id),
                  `Now serving ${token.token_number}.`
                )
              }
            >
              <Play size={ICON.sm} aria-hidden="true" />
              {actionKey === `start-${token.id}` ? "Working…" : "Start Serving"}
            </button>
            <button
              type="button"
              className="qf-btn qf-btn--danger"
              disabled={Boolean(actionKey)}
              onClick={() =>
                runAction(
                  `miss-${token.id}`,
                  () => api.missToken(counter.id, token.id),
                  `${token.token_number} marked no-show.`
                )
              }
            >
              <XCircle size={ICON.sm} aria-hidden="true" />
              Mark No-show
            </button>
          </>
        ) : null}

        {!paused && status === "serving" ? (
          <>
            <button
              type="button"
              className="qf-btn qf-btn--primary"
              disabled={Boolean(actionKey)}
              onClick={() =>
                runAction(
                  `complete-${token.id}`,
                  () => api.completeToken(counter.id, token.id),
                  `${token.token_number} completed.`
                )
              }
            >
              <CheckCircle2 size={ICON.sm} aria-hidden="true" />
              {actionKey === `complete-${token.id}` ? "Working…" : "Complete"}
            </button>
            <button
              type="button"
              className="qf-btn qf-btn--danger"
              disabled={Boolean(actionKey)}
              onClick={() =>
                runAction(
                  `miss-${token.id}`,
                  () => api.missToken(counter.id, token.id),
                  `${token.token_number} marked no-show.`
                )
              }
            >
              <XCircle size={ICON.sm} aria-hidden="true" />
              Mark No-show
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}
