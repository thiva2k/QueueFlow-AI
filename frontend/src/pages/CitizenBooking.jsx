import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  Printer,
  QrCode,
  RefreshCcw,
  Users,
} from "lucide-react";
import QRCode from "qrcode";
import { api, describeError } from "../api.js";
import {
  AnimatedNumber,
  EmptyState,
  FlowField,
  SplitFlap,
  Toaster,
  useToasts,
} from "../components/index.js";
import { BentoCard, BentoGrid, BorderBeam, Marquee, NumberTicker } from "../components/ui/index.js";
import { ICON, LABELS } from "../constants.js";
import useVisiblePolling, { useLatestRequest } from "../useVisiblePolling.js";
import "../styles/booking.css";

const RECENT_TOKENS_KEY = "qf_recent_tokens";
const MAX_RECENT_TOKENS = 5;

// This office's public identity — used in the eyebrow and as the marquee
// fallback label. Not decoration: it names the physical hall these tokens
// belong to.
const OFFICE = "Divisional Secretariat";

// Enter easing + stagger from the Night Terminal motion spec (§5).
const EASE = [0.22, 1, 0.36, 1];

// Shared field chrome (Tailwind-first — booking.css is now print-only).
const FIELD =
  "w-full min-h-[46px] rounded-sm border border-line-strong bg-surface-2/70 px-3 py-2.5 " +
  "text-[0.95rem] text-ink placeholder:text-ink-3 outline-none transition-colors " +
  "focus:border-live focus:ring-1 focus:ring-live/40 " +
  "aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60";
const LABEL = "mb-1.5 block text-[0.8rem] font-semibold text-ink";
const TILE_LABEL =
  "inline-flex items-center gap-1.5 font-mono text-[0.7rem] font-medium uppercase tracking-[0.14em]";

// How-it-works, with mono step coordinates (§4 data ornaments — the codes
// encode the real order of the flow).
const STEPS = [
  { code: "01 · CHOOSE", title: "Choose your service", body: "Pick what you came to do at this office." },
  { code: "02 · ESTIMATE", title: "Get a live estimate", body: "We estimate when you'll actually be served." },
  { code: "03 · ARRIVE", title: "Arrive on time", body: "Come when it's nearly your turn — not before." },
];

// Best-effort, no-PII recent-token trail for this device. Read by the /track
// page's "Recent tokens on this device" list. Never store names/NIC/phone.
function pushRecentToken(tokenNumber) {
  if (!tokenNumber) return;
  try {
    const value = String(tokenNumber).trim().toUpperCase();
    if (!value) return;
    const raw = localStorage.getItem(RECENT_TOKENS_KEY);
    let list = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed
          .map((item) => (typeof item === "string" ? item : item?.token_number || item?.number || ""))
          .map((entry) => String(entry).trim().toUpperCase())
          .filter(Boolean);
      }
    }
    const next = [value, ...list.filter((entry) => entry !== value)].slice(0, MAX_RECENT_TOKENS);
    localStorage.setItem(RECENT_TOKENS_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable (private mode) — the receipt on screen
    // is still the source of truth, so this is best-effort only.
  }
}

function emptyForm(serviceId = "") {
  return { citizen_name: "", nic_or_phone: "", service_id: serviceId };
}

function formatTime(value) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// HHMM for the machine-readable strip (24h, no separator).
function hhmm(value) {
  if (!value) return "----";
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

// Passport-style MRZ, encoded from REAL token data (§3): country, token no.,
// service code, recommended-arrival stamp, padded to a fixed width with `<`.
function buildMrz(token, service) {
  const num = String(token?.token_number || "").replace(/[^a-z0-9]/gi, "").toUpperCase() || "TOKEN";
  const svc =
    String(service?.name || "SERVICE").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12) || "SERVICE";
  const base = `QF<LKA<${num}<${svc}<<ARR${hhmm(token?.recommended_arrival_time)}`;
  return (base + "<".repeat(48)).slice(0, 44);
}

// Sri Lankan phone: 9-12 digits, optionally starting with a single leading 0
// or a +94 country code. Spaces/hyphens are stripped before testing.
const PHONE_PATTERN = /^(?:\+94|0)?\d{9,12}$/;
// Sri Lankan NIC: old format = 9 digits + V/X (case-insensitive),
// new format = 12 digits.
const NIC_PATTERN = /^(?:\d{9}[VvXx]|\d{12})$/;

function validateName(value) {
  if (!value.trim()) return "Please enter your full name.";
  return "";
}

function validateNicOrPhone(value) {
  const trimmed = value.trim();
  if (!trimmed) return "Please enter your NIC or phone number.";
  if (NIC_PATTERN.test(trimmed)) return "";
  const phoneCandidate = trimmed.replace(/[\s-]/g, "");
  if (PHONE_PATTERN.test(phoneCandidate)) return "";
  return "Enter a valid NIC (e.g. 901234567V or 200012345678) or phone number (e.g. 0771234567).";
}

export default function CitizenBooking({ onNavigate }) {
  const reduceMotion = useReducedMotion();
  const { toasts, notify, dismiss } = useToasts();
  const { begin } = useLatestRequest();

  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState("");

  const [queue, setQueue] = useState(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueFailed, setQueueFailed] = useState(false);

  const [form, setForm] = useState(emptyForm());
  const [fieldErrors, setFieldErrors] = useState({ citizen_name: "", nic_or_phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [createdToken, setCreatedToken] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const receiptRef = useRef(null);

  const selectedService = services.find((service) => String(service.id) === String(form.service_id));

  // Orchestrated page-mount rise: eyebrow -> headline -> sub -> card -> hall
  // monitor -> how-it-works. Explicit per-item delays (45ms stagger, 280ms
  // enters) so the order holds regardless of DOM nesting; instant under
  // reduced motion.
  const rise = useCallback(
    (index) => ({
      initial: reduceMotion ? false : { opacity: 0, y: 14 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.28, ease: EASE, delay: reduceMotion ? 0 : index * 0.045 },
    }),
    [reduceMotion],
  );

  // Primary resource: the service list. Without it the form can't function,
  // so a failure here blocks the form and shows a retry state.
  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    setServicesError("");
    try {
      const data = await api.getServices();
      setServices(data);
      setForm((current) => ({
        ...current,
        service_id: current.service_id || String(data[0]?.id || ""),
      }));
    } catch (err) {
      setServicesError(describeError(err));
    } finally {
      setServicesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Secondary resource: the live office pulse strip. Polled independently via
  // Promise.allSettled so a transient failure never blanks the page — it just
  // keeps the last known good numbers on screen.
  const fetchQueue = useCallback(async () => {
    const id = begin();
    const [result] = await Promise.allSettled([api.getQueueStatus()]);
    if (!id.isCurrent()) return;
    if (result.status === "fulfilled") {
      setQueue(result.value);
      setQueueFailed(false);
    } else if (!queue) {
      setQueueFailed(true);
    }
    setQueueLoading(false);
  }, [begin, queue]);

  useEffect(() => {
    fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useVisiblePolling(fetchQueue, 6000);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    // Clear a field's error as soon as the user edits it.
    setFieldErrors((current) => (current[name] ? { ...current, [name]: "" } : current));
  }

  async function submitBooking(event) {
    event.preventDefault();
    setSubmitError("");

    const nextFieldErrors = {
      citizen_name: validateName(form.citizen_name),
      nic_or_phone: validateNicOrPhone(form.nic_or_phone),
    };
    setFieldErrors(nextFieldErrors);

    if (nextFieldErrors.citizen_name || nextFieldErrors.nic_or_phone || !form.service_id) {
      if (!form.service_id) {
        setSubmitError("Please select a service type.");
      }
      return;
    }

    setSubmitting(true);
    try {
      const token = await api.createToken({
        citizen_name: form.citizen_name.trim(),
        nic_or_phone: form.nic_or_phone.trim(),
        service_id: Number(form.service_id),
      });
      setCreatedToken(token);
      pushRecentToken(token.token_number);
    } catch (err) {
      setSubmitError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Audit fix: booking success clears the form and requires an explicit
  // "Book another token" action before the form reappears — prevents
  // accidental duplicate submissions from a lingering filled-in form.
  function resetForNewBooking() {
    setCreatedToken(null);
    setQrDataUrl("");
    setSubmitError("");
    setFieldErrors({ citizen_name: "", nic_or_phone: "" });
    setForm(emptyForm(String(services[0]?.id || "")));
  }

  const statusPath = createdToken ? `/token/${createdToken.token_number}` : "";
  const statusUrl = createdToken ? `${window.location.origin}${statusPath}` : "";

  useEffect(() => {
    let cancelled = false;

    async function generateQrCode() {
      if (!statusUrl) {
        setQrDataUrl("");
        return;
      }
      try {
        const dataUrl = await QRCode.toDataURL(statusUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 6,
          color: {
            dark: "#16233B",
            light: "#ffffff",
          },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrDataUrl("");
      }
    }

    generateQrCode();
    return () => {
      cancelled = true;
    };
  }, [statusUrl]);

  // Audit fix: scroll the boarding-pass receipt into view once it appears.
  useEffect(() => {
    if (createdToken && receiptRef.current) {
      receiptRef.current.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [createdToken, reduceMotion]);

  async function copyStatusLink() {
    if (!statusUrl) return;
    try {
      await navigator.clipboard.writeText(statusUrl);
      notify("Link copied.", { variant: "success" });
    } catch {
      notify("Couldn't copy the link — select it manually.", { variant: "error" });
    }
  }

  const waitingCount = queue?.waiting?.length ?? 0;
  const activeCounters = queue?.active_counters ?? 0;
  const avgService = queue?.average_service_duration;
  const showPulseSkeleton = queueLoading && !queue;
  const pulseUnavailable = queueFailed && !queue;
  const hasQueue = !!queue;

  // Next-up ticker source: the tokens the page already fetches. When there are
  // none (or the pulse is down), the marquee falls back to the live stats +
  // office name — real numbers, never invented queue entries.
  const nextUp = (queue?.waiting ?? []).slice(0, 6);
  const serviceNameFor = (id) => services.find((s) => String(s.id) === String(id))?.name || "Service";

  const ticketService = createdToken
    ? services.find((s) => String(s.id) === String(createdToken.service_id ?? form.service_id))
    : null;
  const mrz = createdToken ? buildMrz(createdToken, ticketService) : "";

  return (
    <main className="qf-shell qf-book flex flex-col gap-10">
      {/* ============================ HERO ============================ */}
      <section className="relative isolate overflow-hidden rounded-lg py-8 sm:py-10">
        <FlowField />

        <div className="relative z-[1] grid grid-cols-12 gap-6 lg:gap-8">
          {/* LEFT 7 — pitch + form/ticket zone */}
          <div className="col-span-12 lg:col-span-7">
            <motion.p className="qf-eyebrow" {...rise(0)}>
              {OFFICE} — public services
            </motion.p>
            <motion.h1
              className="font-display text-[length:var(--display-1)] font-semibold leading-[1.04] tracking-[-0.02em] text-ink"
              {...rise(1)}
            >
              Skip the <span className="qf-gradient-text">waiting room</span>.
            </motion.h1>
            <motion.p className="mt-3 max-w-[52ch] text-[1.05rem] text-ink-2" {...rise(2)}>
              Book a token and we&apos;ll tell you the live estimate — and the time you should actually
              arrive.
            </motion.p>

            {/* ---- form / ticket / error, the page's single BorderBeam ---- */}
            {createdToken ? (
              <BoardingPass
                createdToken={createdToken}
                qrDataUrl={qrDataUrl}
                statusUrl={statusUrl}
                statusPath={statusPath}
                mrz={mrz}
                receiptRef={receiptRef}
                reduceMotion={reduceMotion}
                onCopy={copyStatusLink}
                onNavigate={onNavigate}
                onReset={resetForNewBooking}
              />
            ) : servicesError ? (
              <motion.div
                className="mt-6 rounded-lg border border-line bg-surface p-6"
                {...rise(3)}
              >
                <EmptyState
                  tone="danger"
                  icon={<AlertCircle size={ICON.lg} />}
                  title="We can't load the booking form"
                  message={servicesError}
                  action={
                    <button className="qf-btn qf-btn--secondary" type="button" onClick={loadServices}>
                      Try again
                    </button>
                  }
                />
              </motion.div>
            ) : (
              <BentoCard
                as={motion.form}
                tone="live"
                className="relative mt-6 p-5 sm:p-6"
                onSubmit={submitBooking}
                noValidate
                {...rise(3)}
              >
                <BorderBeam size={150} duration={8} />

                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="qf-eyebrow">New token</p>
                    <h2 className="font-display text-[1.35rem] text-ink">Citizen details</h2>
                  </div>
                  {servicesLoading ? (
                    <RefreshCcw className="qf-spin text-ink-3" size={ICON.md} aria-hidden="true" />
                  ) : null}
                </div>

                {submitError ? (
                  <div
                    className="mb-4 flex items-start gap-2 rounded-sm border border-danger/35 bg-danger-soft px-3 py-2.5 text-[0.9rem] text-danger"
                    role="alert"
                  >
                    <AlertCircle size={ICON.md} aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                ) : null}

                <div className="mb-4">
                  <label className={LABEL} htmlFor="citizen_name">
                    Full name
                  </label>
                  <input
                    id="citizen_name"
                    name="citizen_name"
                    className={FIELD}
                    type="text"
                    value={form.citizen_name}
                    onChange={updateField}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    aria-invalid={fieldErrors.citizen_name ? "true" : "false"}
                    aria-describedby="citizen_name_error"
                  />
                  <p
                    className="mt-1.5 min-h-[1.1em] text-[0.8rem] text-danger"
                    id="citizen_name_error"
                    role="alert"
                    aria-live="polite"
                  >
                    {fieldErrors.citizen_name}
                  </p>
                </div>

                <div className="mb-4">
                  <label className={LABEL} htmlFor="nic_or_phone">
                    NIC or phone number
                  </label>
                  <input
                    id="nic_or_phone"
                    name="nic_or_phone"
                    className={FIELD}
                    type="text"
                    value={form.nic_or_phone}
                    onChange={updateField}
                    placeholder="NIC or mobile number"
                    autoComplete="tel"
                    aria-invalid={fieldErrors.nic_or_phone ? "true" : "false"}
                    aria-describedby="nic_or_phone_error"
                  />
                  <p
                    className="mt-1.5 min-h-[1.1em] text-[0.8rem] text-danger"
                    id="nic_or_phone_error"
                    role="alert"
                    aria-live="polite"
                  >
                    {fieldErrors.nic_or_phone}
                  </p>
                </div>

                <div className="mb-4">
                  <label className={LABEL} htmlFor="service_id">
                    Service type
                  </label>
                  <div className="relative">
                    <select
                      id="service_id"
                      name="service_id"
                      className={`${FIELD} appearance-none pr-10`}
                      value={form.service_id}
                      onChange={updateField}
                      disabled={servicesLoading || !services.length}
                    >
                      {!services.length ? <option value="">No services available</option> : null}
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
                      size={ICON.md}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {selectedService ? (
                  <div className="flex items-center gap-2 rounded-sm border border-live/20 bg-live-soft px-3 py-2.5 text-[0.8rem] text-live">
                    <Building2 size={ICON.sm} aria-hidden="true" />
                    <span>Typical duration: {selectedService.default_duration_minutes} minutes</span>
                  </div>
                ) : null}

                <button
                  className="qf-btn qf-btn--primary mt-5 w-full"
                  type="submit"
                  disabled={servicesLoading || submitting || !services.length}
                >
                  <span>{submitting ? "Creating your token…" : "Create token"}</span>
                  <ArrowRight size={ICON.sm} aria-hidden="true" />
                </button>
                <button
                  className="qf-btn qf-btn--ghost mt-2 w-full text-ink-2"
                  type="button"
                  onClick={() => onNavigate("/track")}
                >
                  <span>Already have a token? Check its status</span>
                  <ArrowRight size={ICON.sm} aria-hidden="true" />
                </button>
              </BentoCard>
            )}
          </div>

          {/* RIGHT 5 — hall monitor bento stack */}
          <div className="col-span-12 lg:col-span-5">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink-3">
                Hall monitor
              </p>
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink-3">
                SEC 01 · LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4" aria-label="Live office status" aria-busy={showPulseSkeleton}>
              {/* Waiting now — the page's oversized numeral moment */}
              <BentoCard as={motion.div} tone="live" className="relative col-span-2 qf-ticks p-5" {...rise(4)}>
                <div className="flex items-center justify-between">
                  <span className={`${TILE_LABEL} text-live`}>
                    <Users size={ICON.sm} aria-hidden="true" />
                    Waiting now
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-live shadow-[0_0_10px_var(--live)]" aria-hidden="true" />
                </div>
                <div
                  className="mt-2 font-mono text-[clamp(2.6rem,9vw,3.6rem)] font-semibold leading-none tabular-nums text-live"
                  style={{ textShadow: "none" }}
                >
                  {hasQueue ? <NumberTicker value={waitingCount} /> : "—"}
                </div>
                <p className="mt-2 text-[0.8rem] text-ink-3">
                  {pulseUnavailable
                    ? "Live counts are unavailable right now."
                    : "citizens ahead in the hall right now"}
                </p>
              </BentoCard>

              {/* Avg service */}
              <BentoCard as={motion.div} className="col-span-1 p-4" {...rise(5)}>
                <span className={`${TILE_LABEL} text-ink-3`}>
                  <Clock3 size={ICON.sm} aria-hidden="true" />
                  Avg service
                </span>
                <div className="mt-2 flex items-baseline gap-1 font-mono text-[1.7rem] font-semibold tabular-nums text-ink">
                  {hasQueue && avgService != null ? (
                    <>
                      <AnimatedNumber value={Math.round(avgService)} />
                      <span className="text-[0.9rem] font-medium text-ink-3">min</span>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </BentoCard>

              {/* Counters open */}
              <BentoCard as={motion.div} className="col-span-1 p-4" {...rise(6)}>
                <span className={`${TILE_LABEL} text-ink-3`}>
                  <Building2 size={ICON.sm} aria-hidden="true" />
                  Counters open
                </span>
                <div className="mt-2 font-mono text-[1.7rem] font-semibold tabular-nums text-ink">
                  {hasQueue ? <AnimatedNumber value={activeCounters} /> : "—"}
                </div>
              </BentoCard>

              {/* Next up — marquee fed by real queue data */}
              <BentoCard as={motion.div} className="col-span-2 overflow-hidden p-4" {...rise(7)}>
                <div className="mb-3 flex items-baseline justify-between">
                  <span className={`${TILE_LABEL} text-ink-3`}>Next up</span>
                  <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-3">
                    {hasQueue ? `${waitingCount} waiting` : "standby"}
                  </span>
                </div>
                <div className="-mx-4">
                  {nextUp.length ? (
                    <Marquee duration={26} gap="2.25rem" pauseOnHover>
                      {nextUp.map((token) => (
                        <span
                          key={token.id ?? token.token_number}
                          className="flex items-center gap-2 whitespace-nowrap font-mono text-[0.85rem]"
                        >
                          <span className="font-semibold text-live">{token.token_number}</span>
                          <span className="text-ink-3">{serviceNameFor(token.service_id)}</span>
                        </span>
                      ))}
                    </Marquee>
                  ) : (
                    <Marquee duration={24} gap="2.25rem">
                      {[
                        `${OFFICE.toUpperCase()}`,
                        `WAITING ${waitingCount}`,
                        `COUNTERS ${activeCounters}`,
                        avgService != null ? `AVG ${Math.round(avgService)} MIN` : "AVG —",
                      ].map((chunk, i) => (
                        <span
                          key={i}
                          className="whitespace-nowrap font-mono text-[0.8rem] uppercase tracking-[0.14em] text-ink-3"
                        >
                          {chunk}
                        </span>
                      ))}
                    </Marquee>
                  )}
                </div>
              </BentoCard>
            </div>
          </div>
        </div>
      </section>

      {/* ========================= HOW IT WORKS ========================= */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl text-ink">How it works</h2>
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink-3">
            SEC 02 · FLOW
          </span>
        </div>
        <BentoGrid>
          {STEPS.map((step, i) => (
            <BentoCard
              as={motion.div}
              key={step.code}
              className="relative col-span-12 qf-ticks p-5 md:col-span-4"
              {...rise(8 + i)}
            >
              <span className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-live">
                {step.code}
              </span>
              <h3 className="mt-3 font-display text-lg text-ink">{step.title}</h3>
              <p className="mt-1.5 text-[0.9rem] text-ink-2">{step.body}</p>
            </BentoCard>
          ))}
        </BentoGrid>
      </section>

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}

// -----------------------------------------------------------------------------
// Boarding-pass ticket — success state. Replaces the form zone. Prints via the
// global .qf-ticket / [data-testid="booking-result"] contract in styles.css.
// -----------------------------------------------------------------------------
function BoardingPass({
  createdToken,
  qrDataUrl,
  statusUrl,
  statusPath,
  mrz,
  receiptRef,
  reduceMotion,
  onCopy,
  onNavigate,
  onReset,
}) {
  return (
    <motion.section
      ref={receiptRef}
      className="qf-ticket relative mt-6 overflow-hidden rounded-lg border border-line bg-surface"
      aria-live="polite"
      data-testid="booking-result"
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
    >
      <BorderBeam size={150} duration={8} />

      {/* Registration seal — one document, placed asymmetrically (§3). */}
      <span className="qf-stamp absolute right-5 top-5 z-[2] text-ok" aria-hidden="true">
        Registered
      </span>

      {/* Stub */}
      <div className="relative p-5 sm:p-6">
        <p className="qf-eyebrow">You&apos;re checked in</p>
        <div className="my-4">
          <SplitFlap
            value={createdToken.token_number}
            size="lg"
            tone="live"
            label={`Token ${createdToken.token_number}`}
          />
        </div>
        <p className="max-w-[56ch] text-[0.9rem] text-ink-2">
          Your token is registered. You don&apos;t need to queue physically until your recommended
          arrival time.
        </p>
      </div>

      {/* Perforation tear-line between stub and body */}
      <div className="qf-perf mx-5 sm:mx-6" aria-hidden="true" />

      {/* Body */}
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-line pb-2">
            <dt className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-ink-3">
              {LABELS.estimatedServiceTime}
            </dt>
            <dd className="font-mono text-[1.05rem] font-semibold text-live">
              {createdToken.estimated_service_time
                ? formatTime(createdToken.estimated_service_time)
                : "Paused"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-line pb-2">
            <dt className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-ink-3">
              {LABELS.recommendedArrival}
            </dt>
            <dd className="font-mono text-[1.05rem] font-semibold text-live">
              {createdToken.recommended_arrival_time
                ? formatTime(createdToken.recommended_arrival_time)
                : "Paused"}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-start gap-5">
          <motion.div
            className="grid h-[116px] w-[116px] shrink-0 place-items-center rounded-md bg-white p-2 text-ink-3"
            aria-label={`QR code for ${createdToken.token_number}`}
            data-testid="token-qr"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.2, duration: 0.3, ease: EASE }}
          >
            {qrDataUrl ? (
              <img
                className="h-full w-full"
                src={qrDataUrl}
                alt={`QR code linking to ${createdToken.token_number} status`}
              />
            ) : (
              <QrCode size={ICON.lg} aria-hidden="true" />
            )}
          </motion.div>

          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-[0.8rem] font-semibold text-ink" htmlFor="status_link">
              Token status link
            </label>
            <input
              id="status_link"
              className="w-full min-h-[46px] rounded-sm border border-line-strong bg-surface-2/70 px-3 py-2.5 font-mono text-[0.8rem] text-ink-2 outline-none focus:border-live focus:ring-1 focus:ring-live/40"
              value={statusUrl}
              readOnly
              onFocus={(event) => event.target.select()}
              data-testid="token-share-link"
            />
            <div className="qf-ticket__noprint mt-3 flex flex-wrap gap-2 print:hidden">
              <button className="qf-btn qf-btn--secondary" type="button" onClick={onCopy}>
                <Copy size={ICON.sm} aria-hidden="true" />
                <span>Copy link</span>
              </button>
              <button
                className="qf-btn qf-btn--secondary"
                type="button"
                onClick={() => onNavigate(statusPath)}
              >
                <ExternalLink size={ICON.sm} aria-hidden="true" />
                <span>Open status</span>
              </button>
              <button className="qf-btn qf-btn--ghost" type="button" onClick={() => window.print()}>
                <Printer size={ICON.sm} aria-hidden="true" />
                <span>Print ticket</span>
              </button>
            </div>
          </div>
        </div>

        <button
          className="qf-btn qf-btn--primary qf-ticket__noprint w-full print:hidden"
          type="button"
          onClick={onReset}
        >
          <CheckCircle2 size={ICON.sm} aria-hidden="true" />
          <span>Book another token</span>
        </button>
      </div>

      {/* Machine-readable strip — built from real token data (§3). */}
      <div className="qf-mrz border-t border-line px-5 py-2.5 text-[0.72rem] sm:px-6">{mrz}</div>
    </motion.section>
  );
}
