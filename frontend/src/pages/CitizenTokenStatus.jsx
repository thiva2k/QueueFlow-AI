import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Clock3,
  MoveRight,
  PauseCircle,
  RefreshCcw,
  SearchX,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { api, describeError } from "../api.js";
import useVisiblePolling, { useLatestRequest } from "../useVisiblePolling.js";
import {
  AnimatedNumber,
  ConfirmDialog,
  EmptyState,
  FlowField,
  LiveIndicator,
  Skeleton,
  SplitFlap,
  StatusChip,
  Toaster,
  useToasts,
} from "../components/index.js";
import { BentoCard, BentoGrid, BorderBeam } from "../components/ui/index.js";
import { cn } from "../lib/utils.js";
import { LABELS, ICON } from "../constants.js";
import "../styles/status.css";

const POLL_INTERVAL_MS = 4000;
const RECENT_TOKENS_KEY = "qf_recent_tokens";
const NOTIFY_OPTIN_KEY = "qf_notify_optin";

const ACTIVE_STATUSES = ["waiting", "called", "serving"];
const CANCELLABLE = new Set(["waiting", "called"]);
// Statuses where the hero switches to the amber "your turn" temperature.
const AMBER_STATUSES = new Set(["called", "serving"]);

// Countdown ring geometry.
const RING_R = 27;
const RING_C = 2 * Math.PI * RING_R;

/* -------------------------------------------------------- motion variants */
const pageContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.03 } },
};
const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};

/* ------------------------------------------------------------------ helpers */
function formatClock(value) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function minutesUntil(value, now) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - now.getTime()) / 60000);
}

function minutesMovedLater(before, after) {
  if (!before || !after) return 0;
  return Math.round((new Date(after).getTime() - new Date(before).getTime()) / 60000);
}

function fraction(start, point, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const p = new Date(point).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.min(1, Math.max(0, (p - s) / (e - s)));
}

// Recent tokens: JSON array of token-number strings, newest first, max 5.
function pushRecentToken(tokenNumber) {
  if (!tokenNumber) return;
  try {
    const raw = localStorage.getItem(RECENT_TOKENS_KEY);
    let list = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed
          .map((item) => (typeof item === "string" ? item : item?.token_number || item?.number || ""))
          .map((value) => String(value).trim().toUpperCase())
          .filter(Boolean);
      }
    }
    const next = [tokenNumber.toUpperCase(), ...list.filter((t) => t !== tokenNumber.toUpperCase())].slice(0, 5);
    localStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — recent list is a convenience, never critical.
  }
}

// SPA navigation without a full reload (App listens for popstate).
function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

// Mono section coordinate that heads each bento card ("SEC 02 · ARRIVAL").
function SecHead({ code, hint }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-3">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-live">{code}</span>
      {hint != null ? <span className="text-right text-[13px] text-ink-3">{hint}</span> : null}
    </div>
  );
}

// Machine-readable strip for the boarding pass — ornament that encodes truth.
// e.g. QF<LKA<A021<NICRENEWAL<<WAITING<ARR1039<EST1102<POS03<<<<
function buildMrz({ token, serviceName, status, position }) {
  const clean = (value, n) =>
    String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, n) || "XX";
  const hhmm = (value) =>
    value
      ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
          .format(new Date(value))
          .replace(":", "")
      : "----";
  const tok = clean(token.token_number, 8);
  const svc = clean(serviceName === "—" ? "" : serviceName, 12);
  const st = clean(status, 8);
  const arr = hhmm(token.recommended_arrival_time);
  const est = hhmm(token.estimated_service_time);
  const pos = position == null ? "--" : String(position).padStart(2, "0");
  return `QF<LKA<${tok}<${svc}<<${st}<ARR${arr}<EST${est}<POS${pos}`.padEnd(46, "<");
}

/* ------------------------------------------------------------- Arrival Rail */
function ArrivalRail({ token, now }) {
  const reduce = useReducedMotion();
  const created = token.created_at;
  const arrival = token.recommended_arrival_time;
  const estimated = token.estimated_service_time;

  // Time axis: Booked (0%) -> Your turn / estimated service (100%).
  const nowPct = fraction(created, now.toISOString(), estimated) * 100;
  const arrivalPct = arrival ? fraction(created, arrival, estimated) * 100 : Math.min(nowPct + 12, 88);
  const peopleAhead = token.people_ahead == null ? 0 : token.people_ahead;

  // Dots for the people still ahead of you, spaced between you and arrival.
  const dotCount = Math.min(peopleAhead, 6);
  const span = Math.max(0, arrivalPct - nowPct);
  const aheadDots = Array.from({ length: dotCount }, (_, i) => nowPct + (span * (i + 1)) / (dotCount + 1));

  const spring = reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 0.61, 0.36, 1] };
  const hint =
    peopleAhead > 0 ? `${peopleAhead} ${peopleAhead === 1 ? "person" : "people"} ahead of you` : "You're next";

  return (
    <div aria-label="Arrival timeline">
      <SecHead code="SEC 02 · ARRIVAL" hint={hint} />

      <div className="rail" role="img" aria-label={`Booked, ${peopleAhead} people ahead, arrive by ${formatClock(arrival)}, your turn near ${formatClock(estimated)}`}>
        <div className="rail__track">
          <div className="rail__fill" style={{ transform: `scaleX(${Math.max(0.02, nowPct / 100)})` }} />
        </div>

        {/* Booked — fixed at start */}
        <div className="rail__marker rail__marker--booked" style={{ left: "0%" }}>
          <span className="rail__marker-dot" />
          <span className="rail__marker-label">Booked</span>
          <span className="rail__marker-time">{formatClock(created)}</span>
        </div>

        {/* People ahead of you — slide as the queue moves */}
        {aheadDots.map((pct, i) => (
          <motion.span
            key={i}
            className="rail__ahead-dot"
            initial={false}
            animate={{ left: `${pct}%` }}
            transition={spring}
          />
        ))}

        {/* Recommended arrival — slides when the prediction moves */}
        <motion.div
          className="rail__marker rail__marker--arrival"
          initial={false}
          animate={{ left: `${arrivalPct}%` }}
          transition={spring}
        >
          <span className="rail__marker-dot" />
          <span className="rail__marker-label">Arrive by</span>
          <span className="rail__marker-time" data-testid="token-recommended-arrival">
            {arrival ? formatClock(arrival) : "—"}
          </span>
        </motion.div>

        {/* Your turn — fixed at end */}
        <div className="rail__marker rail__marker--turn" style={{ left: "100%" }}>
          <span className="rail__marker-dot" />
          <span className="rail__marker-label">Your turn</span>
          <span className="rail__marker-time" data-testid="token-estimated-service">
            {estimated ? formatClock(estimated) : "—"}
          </span>
        </div>

        {/* Your breathing position */}
        <motion.div className="rail__pos" initial={false} animate={{ left: `${nowPct}%` }} transition={spring}>
          <span className="rail__pos-badge" data-testid="token-people-ahead">
            {peopleAhead > 0 ? `${peopleAhead} ahead` : "You're next"}
          </span>
          <span className="rail__pos-dot" aria-hidden="true" />
        </motion.div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Countdown ring */
function CountdownRing({ progress, tone = "live", children }) {
  const p = Math.min(1, Math.max(0, progress || 0));
  const offset = RING_C * (1 - p);
  return (
    <span className={`cring cring--${tone}`}>
      <svg className="cring__svg" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle className="cring__track" cx="32" cy="32" r={RING_R} />
        <circle
          className="cring__prog"
          cx="32"
          cy="32"
          r={RING_R}
          style={{ strokeDasharray: RING_C, strokeDashoffset: offset }}
        />
      </svg>
      <span className="cring__center">{children}</span>
    </span>
  );
}

/* --------------------------------------------------------------- Countdown */
function CountdownCard({ arrival, minutes, progress }) {
  const isNow = minutes != null && minutes <= 0;

  return (
    <div className="flex flex-wrap items-center gap-5" aria-live="polite">
      <CountdownRing progress={isNow ? 1 : progress} tone={isNow ? "amber" : "live"}>
        {isNow ? (
          <span className="cring__now">Go</span>
        ) : (
          <span className="cring__mins">
            {/* 64px ring can't seat 3-digit minute counts — switch to hours */}
            {minutes != null && minutes >= 100 ? (
              <>
                <AnimatedNumber value={Math.round(minutes / 60)} />
                <span className="cring__unit">hr</span>
              </>
            ) : (
              <>
                <AnimatedNumber value={minutes ?? 0} />
                <span className="cring__unit">min</span>
              </>
            )}
          </span>
        )}
      </CountdownRing>
      <div className="countdown__lead">
        <p className="countdown__label">{isNow ? "It's time to go" : "Leave in time to arrive by"}</p>
        <p className="countdown__arrive">
          <span className="mono">{formatClock(arrival)}</span>
        </p>
        <p className="countdown__sub">
          {isNow
            ? "Head to the office now — your turn is coming up."
            : "We'll nudge you when it's nearly time to leave."}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Journey rail */
const JOURNEY_STEPS = ["Waiting", "Called", "Now serving", "Completed"];
const JOURNEY_INDEX = { waiting: 0, called: 1, serving: 2, completed: 3 };

function Journey({ status }) {
  // Terminal states that leave the happy path get explicit, honest markers
  // instead of silently reading as "still waiting".
  if (status === "missed" || status === "cancelled") {
    const isMissed = status === "missed";
    return (
      <div className="journey__rail" aria-label="Token journey">
        <div className="journey__step is-done">
          <span className="journey__node" aria-hidden="true" />
          <span className="journey__label">Booked</span>
        </div>
        <div className={`journey__step ${isMissed ? "is-danger" : "is-neutral"}`}>
          <span className="journey__node" aria-hidden="true" />
          <span className="journey__label">{isMissed ? "No-show" : "Cancelled"}</span>
        </div>
      </div>
    );
  }

  const activeIndex = JOURNEY_INDEX[status] ?? 0;
  return (
    <div className="journey__rail" aria-label="Token journey">
      {JOURNEY_STEPS.map((label, index) => {
        const state = index < activeIndex ? "is-done" : index === activeIndex ? "is-active" : "";
        return (
          <div className={`journey__step ${state}`} key={label}>
            <span className="journey__node" aria-hidden="true" />
            <span className="journey__label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- Details grid */
// Label→value rows with dotted leaders (spec v4 §3).
function DetailsGrid({ token, serviceName, position, assignedCounter, status }) {
  const rows = [
    ["Service", serviceName, false, "sans"],
    ["Queue position", position == null ? "—" : position, true, "mono"],
    ["People ahead", token.people_ahead == null ? "—" : token.people_ahead, false, "mono"],
    [LABELS.recommendedArrival, formatClock(token.recommended_arrival_time), true, "mono"],
    [LABELS.estimatedServiceTime, formatClock(token.estimated_service_time), false, "mono"],
    [
      "Counter",
      assignedCounter?.name || (["called", "serving"].includes(status) ? "Assigning…" : "—"),
      false,
      "sans",
    ],
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-3">
      {rows.map(([label, value, accent, face]) => (
        <div key={label} className="flex flex-col gap-0.5 border-b border-dotted border-line-strong pb-2">
          <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{label}</dt>
          <dd
            className={cn(
              "m-0 text-[15px] font-semibold",
              face === "mono" && "font-mono tabular-nums",
              accent ? "text-live" : "text-ink"
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------- Loading state */
// Corner register marks — qf-ticks lives on an overlay child because the
// BentoCard's own ::before is the cursor spotlight.
function Ticks() {
  return <span className="qf-ticks pointer-events-none absolute inset-0" aria-hidden="true" />;
}

function LoadingState({ tokenNumber }) {
  return (
    <main className="qf-shell flex flex-col gap-6" aria-busy="true">
      <div className="mx-auto w-full max-w-[860px]">
        <Skeleton height="260px" radius="var(--r-lg)" />
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-7">
          <Skeleton height="180px" radius="var(--r-lg)" />
        </div>
        <div className="col-span-12 md:col-span-5">
          <Skeleton height="180px" radius="var(--r-lg)" />
        </div>
        <div className="col-span-12 md:col-span-6">
          <Skeleton height="120px" radius="var(--r-lg)" />
        </div>
        <div className="col-span-12 md:col-span-6">
          <Skeleton height="120px" radius="var(--r-lg)" />
        </div>
      </div>
      <p className="qf-loading-note">Checking the live queue for {tokenNumber}…</p>
    </main>
  );
}

/* ================================================================ page */
export default function CitizenTokenStatus({ tokenNumber }) {
  const reduce = useReducedMotion();
  const [token, setToken] = useState(null);
  const [counters, setCounters] = useState([]);
  const [services, setServices] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [delta, setDelta] = useState("");
  const [alertsOn, setAlertsOn] = useState(() => {
    try {
      return localStorage.getItem(NOTIFY_OPTIN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { toasts, notify, dismiss } = useToasts();
  const { begin } = useLatestRequest();

  const prevPredictionRef = useRef(null);
  const prevStatusRef = useRef(null);
  const arrivalAlertedRef = useRef(false);
  const deltaTimerRef = useRef(null);

  const assignedCounter = useMemo(
    () => counters.find((c) => c.current_token_id === token?.id) || null,
    [counters, token]
  );
  const serviceName = useMemo(
    () => services.find((s) => s.id === token?.service_id)?.name || "—",
    [services, token]
  );

  const status = token?.status;
  const isActive = status && ACTIVE_STATUSES.includes(status);
  const isCalled = AMBER_STATUSES.has(status);
  const estimatesPaused =
    isActive && token.estimated_service_time == null && token.recommended_arrival_time == null;
  const minutesToArrival = useMemo(
    () => (token?.recommended_arrival_time ? minutesUntil(token.recommended_arrival_time, now) : null),
    [token?.recommended_arrival_time, now]
  );
  // Countdown ring progress: how far along the booked -> arrive-by window we are.
  const arrivalProgress = useMemo(() => {
    if (!token?.recommended_arrival_time || !token?.created_at) return 0;
    return fraction(token.created_at, now.toISOString(), token.recommended_arrival_time);
  }, [token?.created_at, token?.recommended_arrival_time, now]);
  // Position derives ONLY from people_ahead (never from queue array indices,
  // which exclude serving tokens and mis-count position).
  const position = token?.people_ahead == null ? null : token.people_ahead + 1;

  /* ---- fire an alert via Notification, falling back to an in-page toast ---- */
  const fireAlert = useCallback(
    (title, body) => {
      const canNotify =
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted";
      if (canNotify) {
        try {
          new Notification(title, { body });
          return;
        } catch {
          // fall through to toast
        }
      }
      notify(`${title} — ${body}`, { variant: "info" });
    },
    [notify]
  );

  /* ---------------------------------------------------------- data fetch */
  const fetchStatus = useCallback(
    async ({ silent = false } = {}) => {
      if (!tokenNumber) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!silent) setRefreshing(true);
      const req = begin();

      // Token is the PRIMARY resource. A failure here (and only here) can show
      // the not-found screen.
      let tokenData;
      try {
        tokenData = await api.getTokenByNumber(tokenNumber.toUpperCase());
      } catch (err) {
        if (!req.isCurrent()) return;
        if (err.status === 404) {
          setNotFound(true);
          setToken(null);
        } else {
          setLoadError(describeError(err));
        }
        setLoading(false);
        if (!silent) setRefreshing(false);
        return;
      }
      if (!req.isCurrent()) return;

      // Secondary resources — a flaky one must NEVER blank the page.
      const [countersRes, servicesRes, predictionRes] = await Promise.allSettled([
        api.getCounters(),
        api.getServices(),
        ACTIVE_STATUSES.includes(tokenData.status)
          ? api.getTokenPrediction(tokenData.id)
          : Promise.resolve(null),
      ]);
      if (!req.isCurrent()) return;

      // Detect a prediction shift for the delta pill (silent polls only, while
      // the token is still waiting for its turn).
      const nextPred = {
        estimated: tokenData.estimated_service_time,
        arrival: tokenData.recommended_arrival_time,
      };
      const prev = prevPredictionRef.current;
      if (silent && prev && tokenData.status === "waiting") {
        const arrivalMoved = minutesMovedLater(prev.arrival, nextPred.arrival);
        const serviceMoved = minutesMovedLater(prev.estimated, nextPred.estimated);
        const primary = arrivalMoved || serviceMoved;
        if (primary) {
          const sign = primary > 0 ? "+" : "";
          const label = arrivalMoved
            ? `Arrival moved ${sign}${arrivalMoved} min`
            : `Estimated service moved ${sign}${serviceMoved} min`;
          setDelta(label);
          if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
          deltaTimerRef.current = setTimeout(() => setDelta(""), 8000);
        }
      }
      prevPredictionRef.current = nextPred;

      setToken(tokenData);
      if (countersRes.status === "fulfilled") setCounters(countersRes.value || []);
      if (servicesRes.status === "fulfilled") setServices(servicesRes.value || []);
      if (predictionRes.status === "fulfilled") setPrediction(predictionRes.value || null);
      setNotFound(false);
      setLoadError("");
      setLastUpdated(new Date());
      setLoading(false);
      if (!silent) setRefreshing(false);

      pushRecentToken(tokenData.token_number);
    },
    [tokenNumber, begin]
  );

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setToken(null);
    setDelta("");
    prevPredictionRef.current = null;
    prevStatusRef.current = null;
    arrivalAlertedRef.current = false;
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => () => {
    if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
  }, []);

  useVisiblePolling(() => fetchStatus({ silent: true }), POLL_INTERVAL_MS, isActive !== false);

  /* ------------------------------------------- browser-notification triggers */
  // Fire on status -> called.
  useEffect(() => {
    if (!status) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!alertsOn || !prev || prev === status) return;
    if (status === "called") {
      fireAlert(
        `Token ${token.token_number} called`,
        `Please go to ${assignedCounter?.name || "your counter"} now.`
      );
    }
  }, [status, alertsOn, token, assignedCounter, fireAlert]);

  // Fire when the recommended arrival is 5 minutes away or less (once per crossing).
  useEffect(() => {
    if (!alertsOn || !isActive || minutesToArrival == null) return;
    if (minutesToArrival <= 5 && minutesToArrival >= -1) {
      if (!arrivalAlertedRef.current) {
        arrivalAlertedRef.current = true;
        fireAlert(
          `Head to the office`,
          `Arrive by ${formatClock(token.recommended_arrival_time)} — that's in ${Math.max(0, minutesToArrival)} min.`
        );
      }
    } else if (minutesToArrival > 5) {
      arrivalAlertedRef.current = false; // reset if the prediction moves later
    }
  }, [alertsOn, isActive, minutesToArrival, token, fireAlert]);

  /* ------------------------------------------------------------- handlers */
  function toggleAlerts() {
    if (alertsOn) {
      setAlertsOn(false);
      try {
        localStorage.setItem(NOTIFY_OPTIN_KEY, "0");
      } catch {
        /* ignore */
      }
      notify("Notifications turned off.", { variant: "info" });
      return;
    }
    const enable = () => {
      setAlertsOn(true);
      try {
        localStorage.setItem(NOTIFY_OPTIN_KEY, "1");
      } catch {
        /* ignore */
      }
    };
    if (typeof window === "undefined" || !("Notification" in window)) {
      // Unsupported — still opt in; alerts fall back to in-page toasts.
      enable();
      notify("We'll alert you here when it's nearly your turn.", { variant: "info" });
      return;
    }
    if (Notification.permission === "granted") {
      enable();
      notify("Notifications are on. We'll alert you when it's nearly your turn.", { variant: "success" });
      return;
    }
    if (Notification.permission === "denied") {
      enable();
      notify("Notifications are blocked in your browser — we'll alert you on this page instead.", { variant: "info" });
      return;
    }
    Notification.requestPermission()
      .then((result) => {
        enable();
        if (result === "granted") {
          notify("Notifications are on. We'll alert you when it's nearly your turn.", { variant: "success" });
        } else {
          notify("No problem — we'll alert you here on this page instead.", { variant: "info" });
        }
      })
      .catch(() => {
        enable();
        notify("We'll alert you here when it's nearly your turn.", { variant: "info" });
      });
  }

  async function handleCancel() {
    if (!token) return;
    setCancelling(true);
    try {
      await api.cancelToken(token.id);
      setConfirmCancel(false);
      setToken((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
      notify("Your token has been cancelled.", { variant: "success" });
      fetchStatus({ silent: true });
    } catch (err) {
      notify(describeError(err), { variant: "error" });
    } finally {
      setCancelling(false);
    }
  }

  /* --------------------------------------------------------------- render */
  if (loading) return <LoadingState tokenNumber={tokenNumber} />;

  if (notFound) {
    return (
      <main className="qf-shell status-page">
        <EmptyState
          icon={<SearchX size={ICON.lg} />}
          title="We couldn't find that token"
          message="Check the number printed on your ticket — it looks like A-021."
          action={
            <div className="status-terminal__actions">
              <button className="qf-btn qf-btn--primary" type="button" onClick={() => navigateTo("/track")}>
                Look up again
              </button>
              <button className="qf-btn qf-btn--ghost" type="button" onClick={() => navigateTo("/book")}>
                Book a new token
              </button>
            </div>
          }
        />
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </main>
    );
  }

  // Whole-page load error with no token to show.
  if (loadError && !token) {
    return (
      <main className="qf-shell status-page">
        <EmptyState
          tone="danger"
          icon={<TriangleAlert size={ICON.lg} />}
          title="We can't load your token right now"
          message={loadError}
          action={
            <button className="qf-btn qf-btn--primary" type="button" onClick={() => fetchStatus()}>
              Try again
            </button>
          }
        />
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </main>
    );
  }

  const terminalMotion = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
      };

  // Terminal states — no rail / countdown.
  if (status === "completed") {
    return (
      <main className="qf-shell status-page">
        <motion.section className="status-terminal status-terminal--ok" {...terminalMotion}>
          <span className="status-terminal__icon"><CheckCircle2 size={28} aria-hidden="true" /></span>
          <span className="status-terminal__token mono">{token.token_number}</span>
          <h1>You were served{token.completed_at ? ` at ${formatClock(token.completed_at)}` : ""} — thank you</h1>
          <p>Your visit is complete. There's nothing more to do. Have a great day.</p>
          <div className="status-terminal__actions">
            <button className="qf-btn qf-btn--primary" type="button" onClick={() => navigateTo("/book")}>Book another token</button>
          </div>
        </motion.section>
        <Journey status={status} />
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </main>
    );
  }

  if (status === "missed") {
    return (
      <main className="qf-shell status-page">
        <motion.section className="status-terminal status-terminal--danger" {...terminalMotion}>
          <span className="status-terminal__icon"><TriangleAlert size={28} aria-hidden="true" /></span>
          <span className="status-terminal__token mono">{token.token_number}</span>
          <h1>Your token was marked no-show</h1>
          <p>Your number was called but you weren't at the counter, so it was passed. Please speak to the front desk to be re-added, or book a new token to rejoin the queue.</p>
          <div className="status-terminal__actions">
            <button className="qf-btn qf-btn--primary" type="button" onClick={() => navigateTo("/book")}>Book a new token</button>
            <button className="qf-btn qf-btn--ghost" type="button" onClick={() => navigateTo("/track")}>Check another token</button>
          </div>
        </motion.section>
        <Journey status={status} />
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </main>
    );
  }

  if (status === "cancelled") {
    return (
      <main className="qf-shell status-page">
        <motion.section className="status-terminal status-terminal--neutral" {...terminalMotion}>
          <span className="status-terminal__icon"><XCircle size={28} aria-hidden="true" /></span>
          <span className="status-terminal__token mono">{token.token_number}</span>
          <h1>This token was cancelled</h1>
          <p>This token is no longer in the queue. If you still need to be seen, book a new token to get a fresh place in line.</p>
          <div className="status-terminal__actions">
            <button className="qf-btn qf-btn--primary" type="button" onClick={() => navigateTo("/book")}>Book a new token</button>
            <button className="qf-btn qf-btn--ghost" type="button" onClick={() => navigateTo("/track")}>Check another token</button>
          </div>
        </motion.section>
        <Journey status={status} />
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </main>
    );
  }

  /* --------------------------------------------- active: waiting/called/serving */
  const riskLevel = token.no_show_risk;
  const showRisk = status === "waiting" && typeof riskLevel === "number" && riskLevel >= 50;

  return (
    <motion.main
      className="qf-shell status-page"
      variants={pageContainer}
      initial={reduce ? false : "hidden"}
      animate="show"
    >
      {/* Boarding pass XL — the page IS a document (spec v4 §6). BorderBeam is
          this page's single beam, so the v3 holo ring stays off. */}
      <motion.header
        variants={rise}
        className={cn(
          "qf-panel status-hero relative mx-auto w-full max-w-[880px]",
          isCalled && "status-hero--called"
        )}
      >
        <FlowField />
        <BorderBeam
          size={140}
          duration={8}
          colorFrom={isCalled ? "var(--amber)" : "var(--live)"}
          colorTo={isCalled ? "var(--live)" : "var(--amber)"}
        />
        {/* Stamped above the MRZ line, clear of the top-right action row. */}
        <span
          className={cn(
            "qf-stamp absolute bottom-14 right-8 z-[1]",
            isCalled ? "text-amber" : "text-ink-3"
          )}
          aria-hidden="true"
        >
          {status === "serving" ? "SERVING" : status === "called" ? "CALLED" : "WAITING"}
        </span>
        <div className="status-hero__inner">
          <div className="status-hero__id-block">
            <p className="qf-eyebrow">Your token</p>
            <SplitFlap
              value={token.token_number}
              size="lg"
              tone={isCalled ? "amber" : "live"}
              label={`Token ${token.token_number}`}
            />
            <div className="status-hero__meta">
              <StatusChip status={status} />
              <LiveIndicator updatedAt={lastUpdated} active={isActive} />
            </div>
          </div>
          <div className="status-hero__actions">
            <button
              type="button"
              className={`status-notify${alertsOn ? " is-on" : ""}`}
              onClick={toggleAlerts}
              aria-pressed={alertsOn}
            >
              {alertsOn ? <BellRing size={ICON.sm} aria-hidden="true" /> : <Bell size={ICON.sm} aria-hidden="true" />}
              <span>{alertsOn ? "Notifying you" : "Notify me"}</span>
            </button>
            <button className="qf-btn qf-btn--secondary" type="button" onClick={() => fetchStatus()} disabled={refreshing}>
              <RefreshCcw size={ICON.sm} className={refreshing ? "qf-spin" : ""} aria-hidden="true" />
              <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
            </button>
            {CANCELLABLE.has(status) ? (
              <button className="qf-btn qf-btn--danger" type="button" onClick={() => setConfirmCancel(true)}>
                <XCircle size={ICON.sm} aria-hidden="true" />
                <span>Cancel my token</span>
              </button>
            ) : null}
          </div>
        </div>

        {isCalled ? (
          <div className="status-call" role="status">
            <BellRing size={ICON.md} aria-hidden="true" />
            <span>
              {status === "called"
                ? `It's your turn — please go to ${assignedCounter?.name || "your counter"} now.`
                : `You're being served${assignedCounter?.name ? ` at ${assignedCounter.name}` : ""}. Please stay at the counter.`}
            </span>
          </div>
        ) : null}

        {/* Machine-readable strip — ornament that encodes truth. */}
        <div className="qf-mrz relative z-[1] mt-5 border-t border-line pt-3 text-[11px]" aria-hidden="true">
          {buildMrz({ token, serviceName, status, position })}
        </div>
      </motion.header>

      <AnimatePresence>
        {delta ? (
          <motion.div
            className="status-delta"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24 }}
          >
            <MoveRight size={ICON.sm} aria-hidden="true" />
            <span>{delta}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {loadError ? (
        <motion.div variants={rise} className="status-risk" role="status" aria-live="polite" style={{ color: "var(--ink-2)" }}>
          <RefreshCcw size={ICON.sm} aria-hidden="true" />
          <span>Showing your last known status — {loadError}</span>
        </motion.div>
      ) : null}

      {estimatesPaused ? (
        <motion.section variants={rise} className="status-paused">
          <PauseCircle size={ICON.lg} aria-hidden="true" />
          <div>
            <strong>{LABELS.estimatesPaused}</strong>
            <p>Your live estimate will return as soon as a counter reopens. You keep your place in line.</p>
          </div>
        </motion.section>
      ) : (
        <BentoGrid className="items-stretch">
          <motion.div
            variants={rise}
            className={cn(
              "col-span-12",
              token.recommended_arrival_time ? "lg:col-span-7" : "lg:col-span-12"
            )}
          >
            <BentoCard className="h-full p-6 max-[560px]:p-4">
              <Ticks />
              <ArrivalRail token={token} now={now} />
            </BentoCard>
          </motion.div>
          {token.recommended_arrival_time ? (
            <motion.div variants={rise} className="col-span-12 lg:col-span-5">
              <BentoCard tone={minutesToArrival != null && minutesToArrival <= 0 ? "amber" : "live"} className="h-full p-6 max-[560px]:p-4">
                <SecHead code="SEC 03 · COUNTDOWN" hint="Live estimate" />
                <CountdownCard
                  arrival={token.recommended_arrival_time}
                  minutes={minutesToArrival}
                  progress={arrivalProgress}
                />
              </BentoCard>
            </motion.div>
          ) : null}
        </BentoGrid>
      )}

      <BentoGrid className="items-stretch">
        <motion.div variants={rise} className="col-span-12 md:col-span-6">
          <BentoCard className="h-full p-6 max-[560px]:p-4">
            <SecHead code="SEC 04 · JOURNEY" />
            <Journey status={status} />
          </BentoCard>
        </motion.div>
        <motion.div variants={rise} className="col-span-12 md:col-span-6">
          <BentoCard className="h-full p-6 max-[560px]:p-4">
            <Ticks />
            <SecHead code="SEC 05 · DETAILS" hint={serviceName === "—" ? undefined : serviceName} />
            <DetailsGrid
              token={token}
              serviceName={serviceName}
              position={position}
              assignedCounter={assignedCounter}
              status={status}
            />
          </BentoCard>
        </motion.div>
      </BentoGrid>

      {showRisk ? (
        <motion.div variants={rise} className="status-risk" role="note">
          <TriangleAlert size={ICON.sm} aria-hidden="true" />
          <span>
            Heads up: tokens like yours are sometimes missed. Turn on notifications and keep an eye on your arrival time so you don't lose your place.
          </span>
        </motion.div>
      ) : null}

      {prediction?.factors?.length ? (
        <motion.section variants={rise} className="status-explain" aria-label="How your time is calculated">
          <p className="status-explain__title">
            <Clock3 size={ICON.sm} aria-hidden="true" /> How your time is worked out
          </p>
          {prediction.confidence_minutes ? (
            <p className="status-explain__conf">
              Accurate to within <strong>±{Math.round(prediction.confidence_minutes)} min</strong>
            </p>
          ) : null}
          <ul>
            {prediction.factors.map((factor, i) => (
              <li key={i}>{factor}</li>
            ))}
          </ul>
        </motion.section>
      ) : null}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel your token?"
        message="This gives up your place in the queue. You can't undo this — you'd need to book a new token to rejoin."
        confirmLabel="Cancel my token"
        cancelLabel="Keep my token"
        loading={cancelling}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
      />

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </motion.main>
  );
}
