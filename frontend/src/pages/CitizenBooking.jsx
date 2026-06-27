import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Clock3,
  Copy,
  ExternalLink,
  QrCode,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import QRCode from "qrcode";
import { API_BASE_URL, api } from "../api.js";

function formatMinutes(value) {
  const minutes = Math.round(value || 0);
  return `${minutes} min`;
}

function formatTime(value) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function minutesUntil(value, now = new Date()) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - now.getTime()) / 60000);
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
  const [services, setServices] = useState([]);
  const [queue, setQueue] = useState(null);
  const [form, setForm] = useState({ citizen_name: "", nic_or_phone: "", service_id: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ citizen_name: "", nic_or_phone: "" });
  const [createdToken, setCreatedToken] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  const selectedService = useMemo(
    () => services.find((service) => String(service.id) === String(form.service_id)),
    [form.service_id, services]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadBookingData() {
      setLoading(true);
      setError("");
      try {
        const [serviceData, queueData] = await Promise.all([api.getServices(), api.getQueueStatus()]);
        if (cancelled) return;
        setServices(serviceData);
        setQueue(queueData);
        setForm((current) => ({
          ...current,
          service_id: current.service_id || String(serviceData[0]?.id || ""),
        }));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not connect to QueueFlow AI.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBookingData();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    // Clear a field's error as soon as the user edits it.
    setFieldErrors((current) => (current[name] ? { ...current, [name]: "" } : current));
  }

  async function submitBooking(event) {
    event.preventDefault();
    setError("");

    const nextFieldErrors = {
      citizen_name: validateName(form.citizen_name),
      nic_or_phone: validateNicOrPhone(form.nic_or_phone),
    };
    setFieldErrors(nextFieldErrors);

    if (nextFieldErrors.citizen_name || nextFieldErrors.nic_or_phone || !form.service_id) {
      if (!form.service_id) {
        setError("Please select a service type.");
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
      setCopyMessage("");
    } catch (submitError) {
      setError(submitError.message || "Could not create your token.");
    } finally {
      setSubmitting(false);
    }
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
            dark: "#071f31",
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

  async function copyStatusLink() {
    if (!statusUrl) return;
    try {
      await navigator.clipboard.writeText(statusUrl);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Copy blocked. Select the link below.");
    }
  }

  return (
    <main className="citizen-shell">
      <section className="citizen-hero">
        <div>
          <p className="eyebrow">QueueFlow AI · Citizen check-in</p>
          <h1>Check in without waiting in line</h1>
          <p className="hero-copy">
            Get a token, a predicted service time, and the time you should actually arrive — so you can skip the queue
            instead of standing in it.
          </p>
        </div>
        <div className="citizen-hero-card">
          <Clock3 size={22} aria-hidden="true" />
          <span>Live predictions from this office</span>
        </div>
      </section>

      <section className="citizen-grid">
        <aside className="citizen-side">
          <div className="howto-panel">
            <p className="section-kicker">How it works</p>
            <h2>Skip the line, arrive on time</h2>
            <ol className="howto-steps">
              <li>
                <div>
                  <strong>Choose your service</strong>
                  <span>Pick what you came to do at this office.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Get a predicted service time</strong>
                  <span>QueueFlow AI estimates when you will be served.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Arrive at the recommended time</strong>
                  <span>Come when it is nearly your turn — not before.</span>
                </div>
              </li>
            </ol>
          </div>

          <article className="citizen-stat-card">
            <span>Waiting now</span>
            <strong>{queue?.waiting?.length ?? "-"}</strong>
          </article>
          <article className="citizen-stat-card">
            <span>Active counters</span>
            <strong>{queue?.active_counters ?? "-"}</strong>
          </article>
          <article className="citizen-stat-card">
            <span>Average service</span>
            <strong>{queue?.average_service_duration == null ? "-" : formatMinutes(queue.average_service_duration)}</strong>
          </article>
          <div className="explanation-panel">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h2>How predictions work</h2>
              <p>
                QueueFlow AI continuously recalculates your estimated service time based on queue movement, service
                duration, counter availability, and delays.
              </p>
            </div>
          </div>
        </aside>

        <div className="booking-col">
          {createdToken ? (
            <section className="booking-result-card" aria-live="polite" data-testid="booking-result">
              <div>
                <p className="section-kicker">You're checked in</p>
                <strong>{createdToken.token_number}</strong>
                <p>Your token is registered. You do not need to wait physically until your recommended arrival time.</p>
              </div>
              <div className="booking-result-grid">
                <article>
                  <span>Estimated Service Time</span>
                  <strong>{formatTime(createdToken.estimated_service_time)}</strong>
                </article>
                <article>
                  <span>Recommended Arrival Time</span>
                  <strong>{formatTime(createdToken.recommended_arrival_time)}</strong>
                </article>
              </div>
              <div className="qr-share-panel">
                <div className="qr-frame" aria-label={`QR code for ${createdToken.token_number}`} data-testid="token-qr">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`QR code linking to ${createdToken.token_number} status`} /> : <QrCode size={72} aria-hidden="true" />}
                </div>
                <div>
                  <label className="field-label compact" htmlFor="status_link">
                    Token status link
                  </label>
                  <input
                    id="status_link"
                    value={statusUrl}
                    readOnly
                    onFocus={(event) => event.target.select()}
                    data-testid="token-share-link"
                  />
                  <div className="share-actions">
                    <button className="action-button secondary" type="button" onClick={copyStatusLink}>
                      <Copy size={16} aria-hidden="true" />
                      <span>Copy Link</span>
                    </button>
                    <button className="action-button" type="button" onClick={() => onNavigate(statusPath)}>
                      <ExternalLink size={16} aria-hidden="true" />
                      <span>Open Status Page</span>
                    </button>
                  </div>
                  {copyMessage ? <p className="copy-message">{copyMessage}</p> : null}
                </div>
              </div>
            </section>
          ) : null}

          <form className="booking-panel" onSubmit={submitBooking}>
          <div className="panel-header">
            <div>
              <p className="section-kicker">New token</p>
              <h2>Citizen Details</h2>
            </div>
            {loading ? <RefreshCcw className="spin" size={20} aria-hidden="true" /> : null}
          </div>

          {error ? (
            <div className="citizen-alert error" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <label className="field-label" htmlFor="citizen_name">
            Full name
          </label>
          <input
            id="citizen_name"
            name="citizen_name"
            type="text"
            value={form.citizen_name}
            onChange={updateField}
            placeholder="Enter your full name"
            autoComplete="name"
            aria-invalid={fieldErrors.citizen_name ? "true" : "false"}
            aria-describedby="citizen_name_error"
          />
          <p className="field-error" id="citizen_name_error" role="alert" aria-live="polite">
            {fieldErrors.citizen_name}
          </p>

          <label className="field-label" htmlFor="nic_or_phone">
            NIC or phone number
          </label>
          <input
            id="nic_or_phone"
            name="nic_or_phone"
            type="text"
            value={form.nic_or_phone}
            onChange={updateField}
            placeholder="NIC or mobile number"
            autoComplete="tel"
            aria-invalid={fieldErrors.nic_or_phone ? "true" : "false"}
            aria-describedby="nic_or_phone_error"
          />
          <p className="field-error" id="nic_or_phone_error" role="alert" aria-live="polite">
            {fieldErrors.nic_or_phone}
          </p>

          <label className="field-label" htmlFor="service_id">
            Service type
          </label>
          <select
            id="service_id"
            name="service_id"
            value={form.service_id}
            onChange={updateField}
            disabled={loading || !services.length}
          >
            {!services.length ? <option value="">No services available</option> : null}
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>

          {selectedService ? (
            <div className="service-hint">
              <Building2 size={18} aria-hidden="true" />
              <span>Typical duration: {selectedService.default_duration_minutes} minutes</span>
            </div>
          ) : null}

          <button className="citizen-primary" type="submit" disabled={loading || submitting || !services.length}>
            <span>{submitting ? "Creating token..." : "Create Token"}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <button className="lookup-secondary booking-lookup-link" type="button" onClick={() => onNavigate("/track")}>
            <span>Already have a token? Check its status</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
        </div>
      </section>
    </main>
  );
}
