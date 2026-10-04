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
              Alles voor uw onderneming,
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
                  Alleen toegankelijk voor u
                </small>
              </span>
            </div>

          </div>

        </div>

      </section>

      <section className="bestemd-auth-panel">

        <form
          className="bestemd-auth-card"
          onSubmit={submit}
        >

          <div className="bestemd-auth-mobile-logo">
            <img
              src="/mijn-bestemming-logo.png"
              alt="Mijn Bestemming"
            />
          </div>

          <div className="bestemd-auth-heading">

            <span className="bestemd-auth-kicker">
              VEILIG INLOGGEN
            </span>

            <h2>
              Welkom terug
            </h2>

            <p>
              Log in met het e-mailadres
              dat aan uw klantaccount is
              gekoppeld.
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

          <div className="field bestemd-auth-field">
            <div className="bestemd-password-label">
              <label htmlFor="password">
                Wachtwoord
              </label>

              <button
                type="button"
                className="bestemd-forgot-password"
                onClick={() => {
                  setError(
                    "De functie 'Wachtwoord vergeten' wordt momenteel veilig ingericht. Neem voor nu contact op met Bestemd.",
                  );
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
            disabled={busy}
          >
            {busy
              ? "Bezig met inloggen…"
              : "Veilig inloggen"}
          </button>

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
                Wij helpen u graag verder.
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
