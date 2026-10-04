"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useState,
} from "react";

import {
  KeyRound,
  ShieldCheck,
} from "lucide-react";

import Logout from "./logout";

type Factor = {
  id: string;
  name: string;
};

export default function Mfa({
  onComplete,
}: {
  onComplete: () => Promise<void>;
}) {
  const [factors, setFactors] =
    useState<Factor[] | null>(null);

  const [factorId, setFactorId] =
    useState("");

  const [setup, setSetup] =
    useState<{
      qrCode: string;
      secret: string;
    } | null>(null);

  const [code, setCode] =
    useState("");

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  useEffect(() => {
    let active = true;

    fetch(
      "/api/auth/mfa",
      {
        cache: "no-store",
      },
    )
      .then(
        async (response) => {
          const data =
            (await response.json()) as {
              error?: string;
              factors: Factor[];
            };

          if (!response.ok) {
            throw new Error(
              data.error,
            );
          }

          if (active) {
            setFactors(
              data.factors,
            );

            setFactorId(
              data.factors[0]
                ?.id ?? "",
            );
          }
        },
      )
      .catch(() => {
        if (active) {
          setError(
            "Tweestapsverificatie kan niet worden geladen. Herlaad de pagina of log opnieuw in.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function act(
    action:
      | "enroll"
      | "verify",
  ) {
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/auth/mfa",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              action,
              factorId,
              code,
            }),
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
          factorId: string;
          qrCode: string;
          secret: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error,
        );
      }

      if (
        action === "enroll"
      ) {
        setFactorId(
          data.factorId,
        );

        setSetup({
          qrCode:
            data.qrCode,
          secret:
            data.secret,
        });
      } else {
        setSetup(null);
        setCode("");

        await onComplete();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Verificatie is niet gelukt.",
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
              EXTRA BEVEILIGING
            </span>

            <h1>
              Nog één stap.
            </h1>

            <p>
              Bevestig uw identiteit
              voordat uw persoonlijke
              klantportaal wordt geopend.
            </p>

          </div>

          <div className="bestemd-auth-trust">

            <div>
              <ShieldCheck />

              <span>
                <strong>
                  Tweestapsverificatie
                </strong>

                <small>
                  Extra bescherming van uw gegevens
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

          <div className="bestemd-mfa-icon">
            <ShieldCheck />
          </div>

          <div className="bestemd-auth-heading">

            <span className="bestemd-auth-kicker">
              IDENTITEIT CONTROLEREN
            </span>

            <h2>
              Tweestapsverificatie
            </h2>

            <p>
              Gebruik de actuele
              zescijferige code uit uw
              authenticator-app.
            </p>

          </div>

          {!factors &&
            !error && (
              <p className="bestemd-auth-status">
                Authenticator controleren…
              </p>
            )}

          {factors?.length ===
            0 &&
            !setup && (
              <div className="bestemd-mfa-setup">

                <p>
                  Er is nog geen
                  authenticator gekoppeld
                  aan uw account.
                </p>

                <button
                  className="btn primary bestemd-auth-submit"
                  disabled={busy}
                  onClick={() =>
                    act("enroll")
                  }
                >
                  Authenticator instellen
                </button>

              </div>
            )}

          {setup && (
            <div className="bestemd-mfa-enroll">

              <p>
                Scan onderstaande QR-code
                met Microsoft Authenticator,
                Google Authenticator of een
                andere TOTP-app.
              </p>

              <div className="bestemd-qr-wrap">
                <img
                  width={220}
                  height={220}
                  src={
                    setup.qrCode.startsWith(
                      "data:image/",
                    )
                      ? setup.qrCode
                      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                          setup.qrCode,
                        )}`
                  }
                  alt="QR-code voor uw authenticator"
                />
              </div>

              <details className="bestemd-mfa-secret">
                <summary>
                  Handmatig instellen
                </summary>

                <code>
                  {setup.secret}
                </code>
              </details>

            </div>
          )}

          {factorId && (
            <form
              className="bestemd-mfa-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  "verify",
                );
              }}
            >

              {factors &&
                factors.length >
                  1 && (
                  <div className="field">
                    <label htmlFor="factor">
                      Authenticator
                    </label>

                    <select
                      id="factor"
                      value={
                        factorId
                      }
                      onChange={(e) =>
                        setFactorId(
                          e.target
                            .value,
                        )
                      }
                    >
                      {factors.map(
                        (f) => (
                          <option
                            key={
                              f.id
                            }
                            value={
                              f.id
                            }
                          >
                            {
                              f.name
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                )}

              <div className="field bestemd-auth-field">

                <label htmlFor="totp">
                  Verificatiecode
                </label>

                <input
                  id="totp"
                  className="bestemd-totp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  placeholder="000000"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.replace(
                        /\D/g,
                        "",
                      ),
                    )
                  }
                />

              </div>

              <button
                className="btn primary bestemd-auth-submit"
                disabled={busy}
              >
                {busy
                  ? "Controleren…"
                  : "Veilig doorgaan"}
              </button>

            </form>
          )}

          {error && (
            <p
              className="bestemd-auth-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="bestemd-auth-security">

            <KeyRound />

            <div>
              <strong>
                Authenticator kwijt?
              </strong>

              <p>
                Neem contact op met
                Bestemd. De beveiliging
                kan vanuit deze pagina
                niet worden overgeslagen.
              </p>
            </div>

          </div>

          <div className="bestemd-auth-logout">
            <Logout />
          </div>

          <div className="bestemd-auth-footer">
            Bestemd · Rust &amp; Vertrouwen
          </div>

        </div>

      </section>

    </main>
  );
}
