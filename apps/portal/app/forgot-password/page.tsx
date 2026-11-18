"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        setError("De aanvraag kon niet worden verwerkt. Probeer het later opnieuw.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("De aanvraag kon niet worden verwerkt. Controleer de verbinding.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bestemd-auth-page">
      <section className="bestemd-auth-brand">
        <div className="bestemd-auth-brand-inner">
          <img className="bestemd-customer-logo" src="/mijn-bestemming-logo.png" alt="Mijn Bestemming" />
          <div className="bestemd-auth-brand-copy"><h1>Toegang herstellen</h1></div>
        </div>
      </section>
      <section className="bestemd-auth-panel">
        <div className="bestemd-auth-card">
          <div className="bestemd-auth-heading">
            <h2>Wachtwoord vergeten?</h2>
            <p>{submitted
              ? "Als dit e-mailadres bij ons bekend is, ontvang je een e-mail met een herstel-link. Controleer ook je spammap."
              : "Vul je e-mailadres in. We sturen een herstel-link als het account bij ons bekend is."}</p>
          </div>
          {!submitted && (
            <form onSubmit={submit}>
              <div className="field bestemd-auth-field">
                <label htmlFor="recovery-email">E-mailadres</label>
                <input id="recovery-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} />
              </div>
              {error && <p role="alert" className="bestemd-auth-error">{error}</p>}
              <button className="btn primary bestemd-auth-submit" type="submit" disabled={busy}>
                {busy ? "Verwerken…" : "Herstelmail aanvragen"}
              </button>
            </form>
          )}
          <Link href="/">Terug naar inloggen</Link>
        </div>
      </section>
    </main>
  );
}
