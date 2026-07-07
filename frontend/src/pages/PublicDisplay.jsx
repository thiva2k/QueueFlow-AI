import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api, describeError } from "../api.js";
import useVisiblePolling, { useLatestRequest } from "../useVisiblePolling.js";
import { StatusChip, EmptyState, Skeleton, SplitFlap } from "../components/index.js";
import { BorderBeam, Marquee } from "../components/ui/index.js";
import { LABELS, ICON } from "../constants.js";
import "../styles/display.css";

const POLL_INTERVAL_MS = 4000;
const IDLE_HIDE_MS = 5000;
const NEXT_UP_LIMIT = 6;
const KIOSK_STORAGE_KEY = "qf_kiosk";
const MUTE_STORAGE_KEY = "qf_display_muted";

function readKioskPreference() {
  try {
    const params = new URLSearchParams(window.location.search);
    const param = params.get("kiosk");
    if (param === "true") return true;
    if (param === "false") return false;
    return window.localStorage.getItem(KIOSK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readMutePreference() {
  // Sound is off by default (per spec) unless the operator has explicitly
  // unmuted this device before.
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function formatClock(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function formatTime(value) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMinutes(value) {
  if (value == null) return "--";
  return `${Math.round(value)} min`;
}

function serviceName(servicesById, serviceId) {
  return servicesById.get(serviceId)?.name || "Service";
}

// One shared AudioContext for the life of the board. Allocating a new context
// per chime leaks hardware pipelines and hits the browser's ~6-context cap on a
// long-running wall display, after which new AudioContext() throws and the
// chime silently dies. Reuse + resume avoids that entirely.
let sharedAudioContext = null;

function playSafeBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!sharedAudioContext) sharedAudioContext = new AudioContext();
    const context = sharedAudioContext;
    if (context.state === "suspended") context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.14);
  } catch {
    // Browsers may block audio until the display has a user gesture. Silent
    // no-op is fine here — the visual flash still communicates the change.
  }
}

/** Office status is derived from live counter data so it can never drift
 * from what the counter cards actually show (audit fix: this used to be a
 * hardcoded "Open and serving" string). */
function deriveOfficeStatus(counters) {
  if (!counters.length) return { label: "Closed", tone: "danger" };
  if (counters.some((counter) => counter.status === "active")) {
    return { label: "Open and serving", tone: "ok" };
  }
  return { label: "Temporarily paused", tone: "warn" };
}

export default function PublicDisplay() {
  const [kiosk, setKiosk] = useState(readKioskPreference);
  const [muted, setMuted] = useState(readMutePreference);
  const [queue, setQueue] = useState(null);
  const [services, setServices] = useState([]);
  const [counters, setCounters] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [idle, setIdle] = useState(false);
  const [fullscreenOn, setFullscreenOn] = useState(false);
  const [flashIds, setFlashIds] = useState(() => new Set());

  const previousActiveRef = useRef(null);
  const idleTimerRef = useRef(null);
  const { begin } = useLatestRequest();

  const servicesById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const tokensById = useMemo(() => {
    const tokens = [...(queue?.now_serving || []), ...(queue?.called || [])];
    return new Map(tokens.map((token) => [token.id, token]));
  }, [queue]);
  const nextUp = useMemo(() => (queue?.waiting || []).slice(0, NEXT_UP_LIMIT), [queue]);
  const officeStatus = useMemo(() => deriveOfficeStatus(counters), [counters]);
  const estimatesPaused = (queue?.active_counters ?? 0) === 0;

  const loadDisplay = useCallback(async () => {
    const reqId = begin();

    try {
      const queueData = await api.getQueueStatus();
      if (!reqId.isCurrent()) return;
      setQueue(queueData);
      setError("");
    } catch (loadError) {
      if (!reqId.isCurrent()) return;
      setError(describeError(loadError));
    } finally {
      if (reqId.isCurrent()) setLoading(false);
    }

    const [serviceResult, counterResult] = await Promise.allSettled([api.getServices(), api.getCounters()]);
    if (!reqId.isCurrent()) return;
    if (serviceResult.status === "fulfilled") setServices(serviceResult.value);
    if (counterResult.status === "fulfilled") setCounters(counterResult.value);
    setLastUpdated(new Date());
  }, [begin]);

  useEffect(() => {
    loadDisplay();
  }, [loadDisplay]);

  useVisiblePolling(loadDisplay, POLL_INTERVAL_MS);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Persist kiosk + mute preferences so a reloaded kiosk restores itself.
  useEffect(() => {
    try {
      window.localStorage.setItem(KIOSK_STORAGE_KEY, kiosk ? "true" : "false");
    } catch {
      // Storage may be unavailable (private browsing) — kiosk still works
      // for this session, it just won't survive a reload.
    }
  }, [kiosk]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "true" : "false");
    } catch {
      // Same as above — non-fatal.
    }
  }, [muted]);

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreenOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Small unobtrusive corner affordance: visible on load / activity, fades
  // out after 5s idle, reappears on any pointer/keyboard activity.
  useEffect(() => {
    const resetIdle = () => {
      setIdle(false);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_HIDE_MS);
    };
    resetIdle();
    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("touchstart", resetIdle);
    window.addEventListener("keydown", resetIdle);
    return () => {
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("touchstart", resetIdle);
      window.removeEventListener("keydown", resetIdle);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Called-token flash + beep: compare this poll's called/serving tokens
  // against the previous poll's snapshot.
  useEffect(() => {
    const activeTokens = [...(queue?.called || []), ...(queue?.now_serving || [])];
    const activeKeys = new Set(activeTokens.map((token) => `${token.id}:${token.status}`));

    if (previousActiveRef.current) {
      const changedIds = activeTokens
        .filter((token) => !previousActiveRef.current.has(`${token.id}:${token.status}`))
        .map((token) => token.id);
      if (changedIds.length) {
        setFlashIds(new Set(changedIds));
        if (!muted) playSafeBeep();
        const clearTimer = window.setTimeout(() => setFlashIds(new Set()), 3200);
        previousActiveRef.current = activeKeys;
        return () => window.clearTimeout(clearTimer);
      }
    }
    previousActiveRef.current = activeKeys;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by the browser without a fresh user
      // gesture — the toggle simply stays in its current state.
    }
  }

  if (loading) {
    return (
      <main className="qf-board" aria-busy="true">
        <div className="qf-board__loading">
          <Skeleton height="72px" width="320px" radius="var(--r-lg)" />
          <Skeleton height="1px" width="1px" />
          <div className="qf-board__loading-grid">
            <Skeleton height="220px" radius="var(--r-lg)" count={4} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`qf-board ${kiosk ? "qf-board--kiosk" : ""} ${idle ? "is-idle" : ""}`} data-testid="public-display">
      {/* Slow CRT/board scanline sweep — pure-transform, reduced-motion safe. */}
      <div className="qf-board__scan" aria-hidden="true" />

      <div className="qf-board__corner" aria-hidden={idle}>
        <button
          type="button"
          className="qf-board__corner-btn"
          onClick={toggleFullscreen}
          data-testid="display-fullscreen"
          aria-label={fullscreenOn ? "Exit fullscreen" : "Enter fullscreen"}
          title={fullscreenOn ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fullscreenOn ? <Minimize2 size={ICON.md} aria-hidden="true" /> : <Maximize2 size={ICON.md} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={`qf-board__corner-btn ${kiosk ? "is-on" : ""}`}
          onClick={() => setKiosk((value) => !value)}
          data-testid="display-kiosk-toggle"
          aria-pressed={kiosk}
          aria-label={kiosk ? "Turn off kiosk mode" : "Turn on kiosk mode"}
          title="Kiosk"
        >
          <MonitorPlay size={ICON.md} aria-hidden="true" />
          <span>Kiosk</span>
        </button>
        <button
          type="button"
          className={`qf-board__corner-btn ${!muted ? "is-on" : ""}`}
          onClick={() => setMuted((value) => !value)}
          data-testid="display-mute-toggle"
          aria-pressed={!muted}
          aria-label={muted ? "Unmute call chime" : "Mute call chime"}
          title={muted ? "Sound off" : "Sound on"}
        >
          {muted ? <VolumeX size={ICON.md} aria-hidden="true" /> : <Volume2 size={ICON.md} aria-hidden="true" />}
        </button>
      </div>

      <div className="qf-board__clock mono" aria-label="Current time">
        <Clock3 size={ICON.lg} aria-hidden="true" />
        <span>{formatClock(now)}</span>
      </div>

      <header className="qf-board__header">
        <p className="qf-eyebrow">QueueFlow AI · Public display</p>
        <h1>Service office queue</h1>
        <p className={`qf-board__status qf-board__status--${officeStatus.tone}`} data-testid="display-office-status">
          <span className="qf-board__status-dot" aria-hidden="true" />
          Office status: {officeStatus.label}
        </p>
      </header>

      {error ? (
        <div className="qf-board__error" role="alert" data-testid="display-error">
          <AlertTriangle size={ICON.md} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="qf-board__now" aria-label="Now serving">
        <h2 className="qf-board__section-title">Now serving</h2>
        {counters.length ? (
          <div className="qf-board__now-grid">
            {counters.map((counter) => {
              const token = counter.current_token_id ? tokensById.get(counter.current_token_id) : null;
              const isPublicToken = token && (token.status === "called" || token.status === "serving");
              const isFlashing = isPublicToken && flashIds.has(token.id);
              const cardState = isPublicToken ? token.status : counter.status === "paused" ? "paused" : "ready";

              return (
                <article
                  className={`qf-board__counter qf-board__counter--${cardState} qf-ticks ${isFlashing ? "is-flash" : ""}`}
                  key={counter.id}
                >
                  {isPublicToken ? (
                    <BorderBeam colorFrom="var(--amber)" colorTo="var(--live)" />
                  ) : null}
                  <span className="qf-board__counter-name">{counter.name}</span>
                  {isPublicToken ? (
                    <>
                      <SplitFlap
                        value={token.token_number}
                        size="xl"
                        tone="amber"
                        label={`Now serving token ${token.token_number}`}
                      />
                      <StatusChip status={token.status} />
                      <p className="qf-board__counter-sub">{serviceName(servicesById, token.service_id)}</p>
                    </>
                  ) : counter.status === "paused" ? (
                    <>
                      <SplitFlap value="--" size="xl" tone="muted" label="No token" />
                      <p className="qf-board__counter-sub">This counter is temporarily unavailable.</p>
                    </>
                  ) : (
                    <>
                      <SplitFlap value="--" size="xl" tone="muted" label="No token" />
                      <p className="qf-board__counter-sub">Ready for the next token.</p>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No counters are set up yet"
            message="The office queue will appear here once counters are added."
            compact
          />
        )}
      </section>

      <section className="qf-board__next" aria-label="Next up">
        <div className="qf-board__section-head">
          <h2 className="qf-board__section-title">Next up</h2>
          {estimatesPaused ? (
            // Same canonical copy used everywhere the estimate can be paused
            // (see LABELS.estimatesPaused). Shown once here rather than
            // repeated inside every compact next-up card below.
            <p className="qf-board__paused-note">{LABELS.estimatesPaused}</p>
          ) : null}
        </div>
        {nextUp.length ? (
          <div className="qf-board__next-strip">
            {nextUp.map((token) => (
              <article className="qf-board__next-card" key={token.id}>
                <SplitFlap value={token.token_number} size="sm" tone="default" label={`Token ${token.token_number}`} />
                <span className="qf-board__next-service">{serviceName(servicesById, token.service_id)}</span>
                <span className="qf-board__next-meta">
                  {token.people_ahead ?? "-"} ahead · {token.estimated_service_time ? formatTime(token.estimated_service_time) : "--:--"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="qf-board__next-empty">No one is waiting right now.</p>
        )}
      </section>

      <footer className="qf-board__footer">
        <div className="qf-board__footer-stat" data-testid="display-average-wait">
          <span>Average wait</span>
          <strong className="mono">{formatMinutes(queue?.average_wait_minutes)}</strong>
        </div>
        <div className="qf-board__marquee" aria-live="polite">
          <Marquee duration={18}>
            <span>Please proceed only when your token is called.</span>
          </Marquee>
        </div>
        <span className="qf-board__footer-updated">
          Updated {lastUpdated ? formatClock(lastUpdated) : "--:--:--"}
        </span>
      </footer>
    </main>
  );
}
