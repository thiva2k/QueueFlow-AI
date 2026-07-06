import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCcw, Lock, BarChart3, XCircle, CheckCircle2, Clock3, TrendingUp } from "lucide-react";
import {
  AnimatedNumber,
  EmptyState,
  LiveIndicator,
  PageHeader,
  StatCard,
  Skeleton,
  Toaster,
  useToasts,
} from "../components/index.js";
import { ICON } from "../constants.js";
import { BentoCard, BentoGrid, NumberTicker } from "../components/ui/index.js";
import { api, describeError, setStaffKey } from "../api.js";
import useVisiblePolling, { useLatestRequest } from "../useVisiblePolling.js";
import "../styles/admin.css";

const POLL_INTERVAL_MS = 15000;
const DAY_OPTIONS = [7, 30];

function roundOrDash(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return String(Math.round(Number(value)));
}

function hourLabel(hour) {
  const h = ((hour + 11) % 12) + 1;
  const suffix = hour < 12 ? "am" : "pm";
  return `${h}${suffix}`;
}

/* ---------- staff-key gate (shared behaviour with the admin dashboard) ----- */

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
        <p className="qf-admin-gate__lead">Enter your staff key to view office analytics.</p>
        <form
          className="qf-admin-gate__form"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            onSubmit(value.trim());
          }}
        >
          <label className="qf-admin-gate__label" htmlFor="qf-an-key">
            Staff key
          </label>
          <input
            id="qf-an-key"
            className="qf-admin-gate__input mono"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="••••••••"
            aria-describedby={tried ? "qf-an-key-error" : undefined}
          />
          {tried ? (
            <p id="qf-an-key-error" className="qf-admin-gate__error" role="alert">
              That key didn't work. Check it and try again.
            </p>
          ) : null}
          <button type="submit" className="qf-btn qf-btn--primary" disabled={submitting || !value.trim()}>
            {submitting ? "Checking…" : "Unlock analytics"}
          </button>
        </form>
      </div>
    </main>
  );
}

/* ---------- accessible inline charts (no chart library) -------------------- */

function WaitByHourChart({ hourly }) {
  const reduce = useReducedMotion();
  const rows = hourly || [];
  const active = rows.filter((r) => r.tokens_created > 0);
  const max = Math.max(1, ...rows.map((r) => r.avg_wait_minutes || 0));
  const peak = active.reduce((best, r) => (r.avg_wait_minutes > (best?.avg_wait_minutes || 0) ? r : best), null);

  const w = 720;
  const h = 220;
  const padL = 40;
  const padB = 28;
  const padT = 12;
  const padR = 12;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const barW = plotW / 24;

  const summary = peak
    ? `Average wait time by hour of day. Longest average wait is ${Math.round(
        peak.avg_wait_minutes
      )} minutes around ${hourLabel(peak.hour)}.`
    : "Average wait time by hour of day. No completed waits recorded yet.";

  return (
    <div className="qf-an-chart">
      <figure className="qf-an-figure">
        <figcaption className="qf-an-figcap">
          <span className="qf-an-figcap__title">Average wait by hour</span>
          <span className="qf-an-figcap__unit">minutes</span>
        </figcaption>
        <div className="qf-an-svgwrap">
          <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={summary} className="qf-an-svg" preserveAspectRatio="none">
            {/* y gridlines */}
            {[0, 0.5, 1].map((f) => {
              const y = padT + plotH * (1 - f);
              return (
                <g key={f}>
                  <line x1={padL} y1={y} x2={w - padR} y2={y} className="qf-an-grid" />
                  <text x={padL - 6} y={y + 3} textAnchor="end" className="qf-an-axis">
                    {Math.round(max * f)}
                  </text>
                </g>
              );
            })}
            {/* bars */}
            {rows.map((r) => {
              const barH = plotH * ((r.avg_wait_minutes || 0) / max);
              const x = padL + r.hour * barW;
              const y = padT + plotH - barH;
              return (
                <motion.rect
                  key={r.hour}
                  x={x + 1.5}
                  y={y}
                  width={Math.max(0, barW - 3)}
                  height={barH}
                  rx="2"
                  className={r.tokens_created > 0 ? "qf-an-bar" : "qf-an-bar qf-an-bar--empty"}
                  style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
                  initial={reduce ? false : { scaleY: 0, opacity: 0.35 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{ duration: 0.45, delay: reduce ? 0 : r.hour * 0.012, ease: [0.22, 1, 0.36, 1] }}
                />
              );
            })}
            {/* x labels every 4h */}
            {rows
              .filter((r) => r.hour % 4 === 0)
              .map((r) => (
                <text
                  key={r.hour}
                  x={padL + r.hour * barW + barW / 2}
                  y={h - 8}
                  textAnchor="middle"
                  className="qf-an-axis"
                >
                  {hourLabel(r.hour)}
                </text>
              ))}
          </svg>
        </div>
      </figure>
      <details className="qf-an-fallback">
        <summary>View as table</summary>
        <div className="qf-an-tablewrap">
          <table className="qf-an-table">
            <caption className="qf-an-srcap">Average wait minutes and tokens created per hour.</caption>
            <thead>
              <tr>
                <th>Hour</th>
                <th>Tokens created</th>
                <th>Avg wait (min)</th>
              </tr>
            </thead>
            <tbody>
              {active.length ? (
                active.map((r) => (
                  <tr key={r.hour}>
                    <td className="mono">{hourLabel(r.hour)}</td>
                    <td className="mono">{r.tokens_created}</td>
                    <td className="mono">{roundOrDash(r.avg_wait_minutes)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="qf-an-table__empty">
                    No hourly activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function OutcomesByDayChart({ days }) {
  const reduce = useReducedMotion();
  const rows = days || [];
  const max = Math.max(1, ...rows.map((d) => (d.completed || 0) + (d.missed || 0) + (d.cancelled || 0)));

  const summary = rows.length
    ? `Daily outcomes stacked by completed, no-show and cancelled tokens across ${rows.length} day(s).`
    : "Daily outcomes. No data in this range yet.";

  return (
    <div className="qf-an-chart">
      <figure className="qf-an-figure">
        <figcaption className="qf-an-figcap">
          <span className="qf-an-figcap__title">Outcomes by day</span>
          <span className="qf-an-legend" aria-hidden="true">
            <span className="qf-an-legend__item">
              <i className="qf-an-swatch qf-an-swatch--ok" /> Completed
            </span>
            <span className="qf-an-legend__item">
              <i className="qf-an-swatch qf-an-swatch--danger" /> No-show
            </span>
            <span className="qf-an-legend__item">
              <i className="qf-an-swatch qf-an-swatch--neutral" /> Cancelled
            </span>
          </span>
        </figcaption>
        {rows.length ? (
          <div className="qf-an-bars" role="img" aria-label={summary}>
            {rows.map((d, i) => {
              const total = (d.completed || 0) + (d.missed || 0) + (d.cancelled || 0);
              return (
                <div key={d.date} className="qf-an-barcol">
                  <motion.div
                    className="qf-an-stack"
                    style={{ height: `${(total / max) * 100}%`, transformOrigin: "bottom" }}
                    initial={reduce ? false : { scaleY: 0, opacity: 0.35 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {d.completed ? (
                      <span
                        className="qf-an-seg qf-an-seg--ok"
                        style={{ flexGrow: d.completed }}
                        title={`${d.completed} completed`}
                      />
                    ) : null}
                    {d.missed ? (
                      <span
                        className="qf-an-seg qf-an-seg--danger"
                        style={{ flexGrow: d.missed }}
                        title={`${d.missed} no-show`}
                      />
                    ) : null}
                    {d.cancelled ? (
                      <span
                        className="qf-an-seg qf-an-seg--neutral"
                        style={{ flexGrow: d.cancelled }}
                        title={`${d.cancelled} cancelled`}
                      />
                    ) : null}
                  </motion.div>
                  <span className="qf-an-barcol__label mono">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState compact icon={<BarChart3 size={ICON.lg} />} title="No daily data yet" />
        )}
      </figure>
      {rows.length ? (
        <details className="qf-an-fallback">
          <summary>View as table</summary>
          <div className="qf-an-tablewrap">
            <table className="qf-an-table">
              <caption className="qf-an-srcap">Completed, no-show and cancelled tokens per day.</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Completed</th>
                  <th>No-show</th>
                  <th>Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.date}>
                    <td className="mono">{d.date}</td>
                    <td className="mono">{d.completed || 0}</td>
                    <td className="mono">{d.missed || 0}</td>
                    <td className="mono">{d.cancelled || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/* ========================================================================== */

export default function AnalyticsInsights() {
  const { toasts, notify, dismiss } = useToasts();
  const { begin } = useLatestRequest();

  const [access, setAccess] = useState("checking");
  const [unlocking, setUnlocking] = useState(false);

  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

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

  const fetchAnalytics = useCallback(async () => {
    const req = begin();
    try {
      const result = await api.getAnalytics(days);
      if (!req.isCurrent()) return;
      setData(result);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (error) {
      if (!req.isCurrent()) return;
      setLoadError(describeError(error));
    } finally {
      if (req.isCurrent()) setLoading(false);
    }
  }, [begin, days]);

  useEffect(() => {
    if (access === "granted") {
      setLoading(true);
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, days]);

  useVisiblePolling(
    () => {
      if (access === "granted") fetchAnalytics();
    },
    POLL_INTERVAL_MS,
    access === "granted"
  );

  const totals = data?.totals;
  const isEmpty = useMemo(() => {
    if (!totals) return false;
    return (
      (totals.completed || 0) === 0 &&
      (totals.missed || 0) === 0 &&
      (totals.cancelled || 0) === 0 &&
      !(data?.days || []).length
    );
  }, [totals, data]);

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

  return (
    <main className="qf-shell qf-analytics">
      <PageHeader
        eyebrow="Staff · analytics"
        title="Analytics &amp; insights"
        subtitle="Throughput, wait times and service mix across the office."
        actions={
          <div className="qf-an-controls">
            <div className="qf-an-range" role="group" aria-label="Date range">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`qf-an-range__btn ${days === option ? "is-active" : ""}`}
                  aria-pressed={days === option}
                  onClick={() => setDays(option)}
                >
                  {option}d
                </button>
              ))}
            </div>
            <LiveIndicator updatedAt={lastUpdated} active />
          </div>
        }
      />

      {loadError ? (
        <div className="qf-admin-alert" role="alert">
          <XCircle size={ICON.md} aria-hidden="true" />
          <span>{loadError}</span>
          <button type="button" className="qf-btn qf-btn--ghost qf-admin-alert__retry" onClick={() => fetchAnalytics()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="qf-analytics-loading" aria-busy="true">
          <Skeleton height="96px" radius="var(--r-lg)" />
          <Skeleton height="240px" radius="var(--r-lg)" />
          <Skeleton height="240px" radius="var(--r-lg)" />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<BarChart3 size={ICON.lg} />}
          title="No activity in this range"
          message="Once citizens are served, throughput and wait-time insights will appear here."
        />
      ) : data ? (
        <>
          <section className="qf-an-totals" aria-label="Totals">
            <StatCard
              label="Completed"
              tone="ok"
              icon={<CheckCircle2 size={ICON.sm} />}
              value={<AnimatedNumber value={totals.completed} />}
            />
            <StatCard
              label="No-shows"
              tone="danger"
              icon={<XCircle size={ICON.sm} />}
              value={<AnimatedNumber value={totals.missed} />}
            />
            <StatCard label="Cancelled" value={<AnimatedNumber value={totals.cancelled} />} />
            <StatCard
              label="Avg wait"
              unit="min"
              icon={<Clock3 size={ICON.sm} />}
              value={<AnimatedNumber value={totals.avg_wait_minutes} format={roundOrDash} />}
            />
            <StatCard
              label="Avg service"
              unit="min"
              icon={<TrendingUp size={ICON.sm} />}
              value={<AnimatedNumber value={totals.avg_service_minutes} format={roundOrDash} />}
            />
            <StatCard
              label="No-show rate"
              tone="warn"
              value={<AnimatedNumber value={Math.round((totals.no_show_rate || 0) * 100)} />}
              unit="%"
            />
          </section>

          {/* Bento composition (spec v4 §6): headline tile + main chart, then 6/6. */}
          <BentoGrid className="items-stretch">
            <BentoCard
              as="section"
              className="qf-admin-panel col-span-12 flex flex-col justify-between lg:col-span-4"
              aria-label="Citizens served"
            >
              <span className="qf-ticks pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="qf-admin-panel__head">
                <p className="qf-eyebrow">SEC 01 · THROUGHPUT</p>
                <h2 className="qf-admin-panel__title">Citizens served</h2>
              </div>
              <div className="pb-2">
                <p className="font-display text-[clamp(3rem,2.2rem+2.5vw,4.5rem)] font-semibold leading-none text-live">
                  <NumberTicker value={totals.completed} />
                </p>
                <p className="mt-3 text-[13px] text-ink-2">completed visits in the selected range</p>
              </div>
            </BentoCard>

            <BentoCard as="section" className="qf-admin-panel col-span-12 lg:col-span-8">
              <WaitByHourChart hourly={data.hourly} />
            </BentoCard>

            <BentoCard as="section" className="qf-admin-panel col-span-12 lg:col-span-6">
            <div className="qf-admin-panel__head">
              <p className="qf-eyebrow">SEC 02 · SERVICE MIX</p>
              <h2 className="qf-admin-panel__title">By service</h2>
            </div>
            {data.services?.length ? (
              <div className="qf-an-tablewrap">
                <table className="qf-an-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Completed</th>
                      <th>No-show</th>
                      <th>Avg duration (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.map((s) => (
                      <tr key={s.service_id}>
                        <td>{s.name}</td>
                        <td className="mono">{s.completed}</td>
                        <td className="mono">{s.missed}</td>
                        <td className="mono">{roundOrDash(s.avg_duration_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState compact icon={<BarChart3 size={ICON.lg} />} title="No services recorded" />
            )}
            </BentoCard>

            <BentoCard as="section" className="qf-admin-panel col-span-12 lg:col-span-6">
              <span className="qf-ticks pointer-events-none absolute inset-0" aria-hidden="true" />
              <OutcomesByDayChart days={data.days} />
            </BentoCard>
          </BentoGrid>
        </>
      ) : null}

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
