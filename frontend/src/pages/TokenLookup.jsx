import React, { useState } from "react";
import { ArrowRight, Search, Ticket } from "lucide-react";

export default function TokenLookup({ onNavigate, initialError = "" }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(initialError);

  function submit(event) {
    event.preventDefault();
    const token = value.trim().toUpperCase();
    if (!token) {
      setError("Enter your token number, for example A-021.");
      return;
    }
    onNavigate(`/token/${encodeURIComponent(token)}`);
  }

  return (
    <main className="citizen-shell">
      <section className="lookup-wrap">
        <div className="lookup-card">
          <span className="lookup-mark" aria-hidden="true">
            <Ticket size={22} />
          </span>
          <p className="eyebrow">Track your token</p>
          <h1>Check your token status</h1>
          <p className="hero-copy">
            Already have a token? Enter its number to see your live position, estimated service time, and recommended
            arrival time.
          </p>
          <form onSubmit={submit} className="lookup-form">
            <label className="field-label" htmlFor="token_lookup">
              Token number
            </label>
            <div className="lookup-input-row">
              <input
                id="token_lookup"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError("");
                }}
                placeholder="e.g. A-021"
                autoComplete="off"
                autoCapitalize="characters"
                aria-invalid={error ? "true" : "false"}
                aria-describedby="token_lookup_error"
              />
              <button className="action-button primary" type="submit">
                <Search size={16} aria-hidden="true" />
                <span>Check status</span>
              </button>
            </div>
            <p className="field-error" id="token_lookup_error" role="alert" aria-live="polite">
              {error}
            </p>
          </form>
          <button className="lookup-secondary" type="button" onClick={() => onNavigate("/book")}>
            <span>Don&apos;t have a token yet? Book one</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  );
}
