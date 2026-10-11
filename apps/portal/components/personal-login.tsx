"use client";

import {
  useState,
} from "react";

import {
  Compass,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";


export default function PersonalLogin() {
  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    busy,
    setBusy,
  ] =
    useState(false);


  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/auth/personal-login",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                email,
                password,
              }),
          },
        );

      const data =
        await response.json() as {
          error?: string;
        };

      setPassword("");

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Inloggen is niet gelukt.",
        );
      }

      location.replace(
        "/mijn-bestemming",
      );

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Inloggen is tijdelijk niet beschikbaar.",
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

            <span className="bestemd-auth-kicker">
              PERSOONLIJKE OMGEVING
            </span>

            <h1>
              Jouw leven.
              Jouw bestemming.
            </h1>

            <p>
              Inzicht in jouw persoonlijke
              doelen, financiële planning
              en toekomst.
            </p>

          </div>


          <div className="bestemd-auth-trust">

            <div>
              <Compass />

              <span>
                <strong>
                  Persoonlijk
                </strong>

                <small>
                  Alleen jouw eigen omgeving
                </small>
              </span>
            </div>

            <div>
              <LockKeyhole />

              <span>
                <strong>
                  Privé
                </strong>

                <small>
                  Niet gedeeld met medewerkers
                  van jouw onderneming
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

          <div className="bestemd-auth-heading">

            <span className="bestemd-auth-kicker">
              MIJN BESTEMMING
            </span>

            <h2>
              Persoonlijk inloggen
            </h2>

            <p>
              Log in met jouw persoonlijke
              Bestemd-account.
            </p>

          </div>


          <div className="field bestemd-auth-field">
            <label htmlFor="personal-email">
              E-mailadres
            </label>

            <input
              id="personal-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
            />
          </div>


          <div className="field bestemd-auth-field">
            <label htmlFor="personal-password">
              Wachtwoord
            </label>

            <input
              id="personal-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(
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
              ? "Bezig met inloggen…"
              : "Persoonlijk inloggen"}
          </button>


          <a
            href="/"
            className="bestemd-auth-back"
          >
            Terug naar keuze
          </a>


          <div className="bestemd-auth-security">

            <ShieldCheck />

            <div>
              <strong>
                Persoonlijke toegang
              </strong>

              <p>
                Alleen de ingelogde persoon
                krijgt toegang tot zijn of haar
                persoonlijke omgeving.
              </p>
            </div>

          </div>

        </form>

      </section>

    </main>
  );
}
