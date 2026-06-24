import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Clock3, RefreshCcw, ShieldCheck } from "lucide-react";
import { API_BASE_URL, api } from "../api.js";

function formatMinutes(value) {
  const minutes = Math.round(value || 0);
  return `${minutes} min`;
}

export default function CitizenBooking({ onNavigate }) {
  const [services, setServices] = useState([]);
  const [queue, setQueue] = useState(null);
  const [form, setForm] = useState({ citizen_name: "", nic_or_phone: "", service_id: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      onNavigate(`/token/${token.token_number}`);
    } catch (submitError) {
      setError(submitError.message || "Could not create your token.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="citizen-shell">
      <section className="citizen-hero">
        <div>
          <p className="eyebrow">QueueFlow AI Citizen Portal</p>
          <h1>Book your queue token before you arrive</h1>
          <p className="hero-copy">
            Get your token number, live queue position, estimated service time, and recommended arrival time.
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
            <span>You can wait away from the office until your recommended arrival time.</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
