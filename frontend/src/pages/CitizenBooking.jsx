import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
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

function arrivalReceiptMessage(token) {
  const minutes = minutesUntil(token?.recommended_arrival_time);
  if (minutes == null) return "Keep this link open. Your recommended arrival time will update as the queue moves.";
  if (minutes <= 0) return "Please come to the office now. Your recommended arrival time has arrived.";
  if (minutes <= 15) return "Please start heading to the office soon.";
  return "Arrive at the recommended time, not the appointment time.";
}

export default function CitizenBooking({ onNavigate }) {
  const [services, setServices] = useState([]);
  const [queue, setQueue] = useState(null);
  const [form, setForm] = useState({ citizen_name: "", nic_or_phone: "", service_id: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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
  }

  async function submitBooking(event) {
    event.preventDefault();
    setError("");

    if (!form.citizen_name.trim() || !form.nic_or_phone.trim() || !form.service_id) {
      setError("Please enter your name, NIC or phone number, and service type.");
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
          <p className="eyebrow">QueueFlow AI Citizen Portal</p>
          <h1>Book your queue token before you arrive</h1>
          <p className="hero-copy">
            Get your token number, predicted service time, and the recommended arrival time that helps you avoid waiting.
          </p>
        </div>
        <div className="citizen-hero-card">
          <Clock3 size={22} aria-hidden="true" />
          <span>Live predictions from {API_BASE_URL}</span>
        </div>
      </section>

      <section className="citizen-grid">
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
          />

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
          />

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
            <span>{submitting ? "Creating token..." : "Book Token"}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>

        <aside className="citizen-side">
          {createdToken ? (
            <section className="booking-result-card" aria-live="polite" data-testid="booking-result">
              <div>
                <p className="section-kicker">Token created</p>
                <strong>{createdToken.token_number}</strong>
                <p>{arrivalReceiptMessage(createdToken)}</p>
              </div>
              <div className="booking-result-grid">
                <article>
                  <span>Estimated service</span>
                  <strong>{formatTime(createdToken.estimated_service_time)}</strong>
                </article>
                <article>
                  <span>Recommended arrival</span>
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
                      <span>Open Status</span>
                    </button>
                  </div>
                  {copyMessage ? <p className="copy-message">{copyMessage}</p> : null}
                </div>
              </div>
            </section>
          ) : null}

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
          <div className="citizen-alert success">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>Use your recommended arrival time to decide whether to wait away or come now.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
