"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useState,
} from "react";

import {
  CheckCircle2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const invalid =
    typeof window !== "undefined" &&
    new URL(
      window.location.href,
    ).searchParams.get("error") ===
      "invalid";

  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/auth/reset-password",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              password,
              confirmPassword,
            }),
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
        };

      if (!response.ok) {
        setError(
          data.error ??
            "Het wachtwoord kon niet worden gewijzigd.",
        );

        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess(true);

    } catch {
      setError(
        "Het wachtwoord kon tijdelijk niet worden gewijzigd. Probeer het opnieuw.",
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
              Kies een nieuw wachtwoord.
            </h1>

          </div>

          <div className="bestemd-auth-trust">

            <div>
              <ShieldCheck />

              <span>
                <strong>
                  Beveiligde herstelprocedure
                </strong>

                <small>
                  Jouw MFA blijft actief
                </small>
              </span>
            </div>

          </div>

        </div>

      </section>

      <section className="bestemd-auth-panel">

        <div className="bestemd-auth-card">

          <div className="bestemd-auth-mobile-logo">
            <img
              src="/mijn-bestemming-logo.png"
              alt="Mijn Bestemming"
            />
          </div>

          {success ? (
            <>
              <div className="bestemd-mfa-icon">
                <CheckCircle2 />
              </div>

              <div className="bestemd-auth-heading">
                <h2>
                  Wachtwoord gewijzigd
                </h2>

                <p>
                  Je kunt nu opnieuw
                  inloggen met je nieuwe
                  wachtwoord.
                </p>
              </div>

              <a
                className="btn primary bestemd-auth-submit bestemd-auth-link-button"
                href="/"
              >
                Naar inloggen
              </a>
            </>
          ) : invalid ? (
            <>
              <div className="bestemd-mfa-icon">
                <KeyRound />
              </div>

              <div className="bestemd-auth-heading">
                <h2>
                  Link niet meer geldig
                </h2>

                <p>
                  Deze herstel-link is
                  verlopen of ongeldig.
                  Vraag vanaf het
                  inlogscherm een nieuwe
                  herstelmail aan.
                </p>
              </div>

              <a
                className="btn primary bestemd-auth-submit bestemd-auth-link-button"
                href="/"
              >
                Terug naar inloggen
              </a>
            </>
          ) : (
            <form onSubmit={submit}>

              <div className="bestemd-mfa-icon">
                <KeyRound />
              </div>

              <div className="bestemd-auth-heading">
                <h2>
                  Nieuw wachtwoord
                </h2>

                <p>
                  Gebruik minimaal
                  12 tekens.
                </p>
              </div>

              <div className="field bestemd-auth-field">
                <label htmlFor="password">
                  Nieuw wachtwoord
                </label>

                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="field bestemd-auth-field">
                <label htmlFor="confirm-password">
                  Herhaal wachtwoord
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value,
                    )
                  }
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
                  ? "Wachtwoord wijzigen…"
                  : "Wachtwoord wijzigen"}
              </button>

            </form>
          )}

          <div className="bestemd-auth-footer">
            Bestemd · Rust &amp; Vertrouwen
          </div>

        </div>

      </section>

    </main>
  );
}
