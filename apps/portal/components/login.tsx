"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import {
  HelpCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

export default function Login() {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [
    forgotPassword,
    setForgotPassword,
  ] = useState(false);

  const [
    recoverySent,
    setRecoverySent,
  ] = useState(false);

  async function submit(
    e: React.FormEvent,
  ) {
    e.preventDefault();

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        },
      );

      const data =
        (await response.json()) as {
          error?: string;
        };

      setPassword("");

      if (!response.ok) {
        setError(
          data.error ??
            "Inloggen is niet gelukt.",
        );

        return;
      }

      location.replace("/");
    } catch {
      setError(
        "Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recoverPassword(
    e: React.FormEvent,
  ) {
    e.preventDefault();

    setBusy(true);
    setError("");

    try {
      await fetch(
        "/api/auth/forgot-password",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            email,
          }),
        },
      );

      setRecoverySent(true);

    } catch {
      /*
       * Zelfde eindmelding houden om
       * account-enumeratie te voorkomen.
       */
      setRecoverySent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bestemd-auth-page">

      <section className="bestemd-auth-brand">

        <div className="bestemd-auth-brand-inner">

          <img
            className="bestemd-customer-logo"
            src="/mijn-bestemming-logo.png"
            alt="Mijn Bestemming"
          />

          <div className="bestemd-auth-brand-copy">

            <h1>
              Alles voor jouw onderneming,
              op één veilige plek.
            </h1>

          </div>

          <div className="bestemd-auth-trust">

            <div>
              <ShieldCheck />

              <span>
                <strong>
                  Veilig beveiligd
                </strong>

                <small>
                  Tweestapsverificatie
                </small>
              </span>
            </div>

            <div>
              <LockKeyhole />

              <span>
                <strong>
                  Persoonlijke omgeving
                </strong>

                <small>
                  Alleen toegankelijk voor jou
                </small>
              </span>
            </div>

          </div>

        </div>

      </section>

      <section className="bestemd-auth-panel">

        <form
          className="bestemd-auth-card"
          onSubmit={
            forgotPassword
              ? recoverPassword
              : submit
          }
        >

          <div className="bestemd-auth-mobile-logo">
            <img
              src="/mijn-bestemming-logo.png"
              alt="Mijn Bestemming"
            />
          </div>

          <div className="bestemd-auth-heading">

            <h2>
              {forgotPassword
                ? "Wachtwoord herstellen"
                : "Welkom terug"}
            </h2>

            <p>
              {forgotPassword
                ? "Vul je e-mailadres in. Als dit bij ons bekend is, ontvang je een herstelmail."
                : "Log in met het e-mailadres dat aan jouw klantaccount is gekoppeld."}
            </p>

          </div>

          <div className="field bestemd-auth-field">
            <label htmlFor="email">
              E-mailadres
            </label>

            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value,
                )
              }
              autoComplete="username"
            />
          </div>

          {!forgotPassword && (
            <>
          <div className="field bestemd-auth-field">
            <div className="bestemd-password-label">
              <label htmlFor="password">
                Wachtwoord
              </label>

              <button
                type="button"
                className="bestemd-forgot-password"
                onClick={() => {
                  setForgotPassword(true);
                  setRecoverySent(false);
                  setError("");
                  setPassword("");
                }}
              >
                Wachtwoord vergeten?
              </button>
            </div>

            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value,
                )
              }
              autoComplete="current-password"
            />
          </div>

            </>
          )}

          {forgotPassword && recoverySent && (
            <div className="bestemd-auth-security">
              <ShieldCheck />

              <div>
                <strong>
                  Controleer je inbox
                </strong>

                <p>
                  Als dit e-mailadres bij ons bekend is,
                  ontvang je binnen enkele minuten een
                  herstelmail.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p
              className="bestemd-auth-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            className="btn primary bestemd-auth-submit"
            disabled={
              busy ||
              (forgotPassword &&
                recoverySent)
            }
          >
            {forgotPassword
              ? busy
                ? "Versturen…"
                : recoverySent
                  ? "Herstelmail aangevraagd"
                  : "Herstelmail versturen"
              : busy
                ? "Bezig met inloggen…"
                : "Inloggen"}
          </button>

          {forgotPassword && (
            <button
              type="button"
              className="bestemd-auth-back"
              onClick={() => {
                setForgotPassword(false);
                setRecoverySent(false);
                setError("");
              }}
            >
              Terug naar inloggen
            </button>
          )}

          <div className="bestemd-auth-security">

            <ShieldCheck />

            <div>
              <strong>
                Beveiligd met tweestapsverificatie
              </strong>

              <p>
                Na het inloggen bevestigt
                u uw identiteit via uw
                gekoppelde authenticator-app.
              </p>
            </div>

          </div>

          <div className="bestemd-auth-help">

            <HelpCircle />

            <div>
              <strong>
                Hulp nodig met inloggen?
              </strong>

              <p>
                Neem contact op met Bestemd.
                We helpen je graag verder.
              </p>
            </div>

          </div>

          <div className="bestemd-auth-footer">
            Bestemd · Rust &amp; Vertrouwen
          </div>

        </form>

      </section>

    </main>
  );
}
