"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Compass,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import Mfa from "./mfa";

type Access = {
  business?: boolean;
  personal?: boolean;
  mfaRequired?: boolean;
  error?: string;
};

type Stage = "loading" | "login" | "mfa" | "choice" | "error";

export default function CentralLogin() {
  const [stage, setStage] = useState<Stage>("loading");
  const [access, setAccess] = useState<Access>({});
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // BESTEMD_EMAIL_CODE_93E
  const [loginMethod, setLoginMethod] = useState<"password" | "email" | "whatsapp">("password");
  const [emailStep, setEmailStep] = useState<"request" | "verify">("request");
  const [emailToken, setEmailToken] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/available-portals", {
        cache: "no-store",
      });

      const data = (await response.json()) as Access;

      if (response.status === 401) {
        setStage("login");
        return;
      }

      if (!response.ok) {
        setMessage(data.error ?? "De toegang kan niet worden gecontroleerd.");
        setStage("error");
        return;
      }

      if (data.mfaRequired) {
        setStage("mfa");
        return;
      }

      setAccess(data);
      setStage("choice");
    } catch {
      setMessage("Er kan geen verbinding worden gemaakt.");
      setStage("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    void fetch("/api/auth/whatsapp-code/status", { cache: "no-store" })
      .then(response => response.ok ? response.json() : { enabled: false })
      .then((data: unknown) => setWhatsappEnabled(
        typeof data === "object" && data !== null && "enabled" in data && data.enabled === true,
      ))
      .catch(() => setWhatsappEnabled(false));
  }, [refresh]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Inloggen is niet gelukt.");
      }

      setPassword("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inloggen is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function chooseMethod(method: "password" | "email" | "whatsapp") {
    setLoginMethod(method);
    setEmailStep("request");
    setEmailToken("");
    setMessage("");
  }

  async function submitEmailCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const requesting = emailStep === "request";
      const response = await fetch(
        requesting
          ? (loginMethod === "whatsapp" ? "/api/auth/whatsapp-code/request" : "/api/auth/email-code/request")
          : (loginMethod === "whatsapp" ? "/api/auth/whatsapp-code/verify" : "/api/auth/email-code/verify"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requesting
            ? (loginMethod === "whatsapp" ? { phone: mobile.trim() } : { email: email.trim() })
            : (loginMethod === "whatsapp"
              ? { phone: mobile.trim(), token: emailToken.trim() }
              : { email: email.trim(), token: emailToken.trim() })),
        },
      );

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Het verzoek is niet gelukt.");
      }

      if (requesting) {
        setEmailStep("verify");
        setResendSeconds(60);
        setMessage(data.message ?? (loginMethod === "whatsapp" ? "Als dit account in aanmerking komt, ontvang je een WhatsApp-code." : "Controleer je e-mail voor de inlogcode."));
      } else {
        setEmailToken("");
        await refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Het verzoek is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  async function resendEmailCode() {
    if (busy || resendSeconds > 0) return;
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(loginMethod === "whatsapp" ? "/api/auth/whatsapp-code/request" : "/api/auth/email-code/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(loginMethod === "whatsapp" ? { phone: mobile.trim() } : { email: email.trim() }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Opnieuw verzenden is niet gelukt.");
      setResendSeconds(60);
      setMessage(data.message ?? (loginMethod === "whatsapp" ? "Controleer WhatsApp." : "Controleer je e-mail."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opnieuw verzenden is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="bestemd-new-page">
      <div className="bestemd-new-background" aria-hidden="true" />

      <div className="bestemd-new-content">
        <header className="bestemd-new-header">
          <div className="bestemd-new-wordmark">
            <img
              src="/mijn-bestemming-logo.png"
              alt="Mijn Bestemming"
              className="bestemd-new-logo"
            />
          </div>
          <span className="bestemd-new-header-caption">JOUW FINANCIËLE WERELD</span>
        </header>

        <section className="bestemd-new-card">
          {stage === "loading" && (
            <div className="bestemd-new-state" role="status">
              <div className="bestemd-new-loading-icon">
                <LockKeyhole size={24} />
              </div>
              <h1>Welkom bij BESTEMD</h1>
              <p>Je omgeving wordt klaargemaakt.</p>
              <div className="bestemd-new-progress" aria-hidden="true">
                <div className="bestemd-new-progress-bar" />
              </div>
            </div>
          )}

          {stage === "login" && (
            <form
              className="bestemd-new-form"
              onSubmit={loginMethod === "whatsapp" && !whatsappEnabled ? (event) => event.preventDefault() : loginMethod === "password" ? signIn : submitEmailCode}
            >
              <span className="bestemd-new-icon"><LockKeyhole size={22} /></span>
              <h1>Welkom terug.</h1>
              <p>Log in bij Mijn Bestemming.</p>

              <div className="bestemd-login-methods" aria-label="Inlogmethodes">
                <button
                  type="button"
                  className={`bestemd-login-method ${loginMethod === "password" ? "bestemd-login-method-active" : ""}`}
                  onClick={() => chooseMethod("password")}
                  aria-pressed={loginMethod === "password"}
                  disabled={busy}
                >
                  <LockKeyhole size={17} />
                  <span>Wachtwoord</span>
                </button>
                <button
                  type="button"
                  className={`bestemd-login-method ${loginMethod === "email" ? "bestemd-login-method-active" : ""}`}
                  onClick={() => chooseMethod("email")}
                  aria-pressed={loginMethod === "email"}
                  disabled={busy}
                >
                  <span className="bestemd-login-method-symbol">@</span>
                  <span>E-mailcode</span>
                </button>
                <button
                  type="button"
                  className={`bestemd-login-method ${loginMethod === "whatsapp" ? "bestemd-login-method-active" : ""}`}
                  onClick={() => chooseMethod("whatsapp")}
                  aria-pressed={loginMethod === "whatsapp"}
                  disabled={busy}
                >
                  <MessageCircle size={17} />
                  <span>WhatsApp</span>
                </button>
              </div>

              <div className="bestemd-new-fields">
                <label htmlFor={loginMethod === "whatsapp" ? "bestemd-mobile" : "bestemd-email"}>
                  {loginMethod === "whatsapp" ? "Mobiel nummer met WhatsApp" : "E-mailadres"}
                </label>
                {loginMethod === "whatsapp" ? (
                  <input
                    id="bestemd-mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={20}
                    placeholder="06 12345678"
                    value={mobile}
                    onChange={event => setMobile(event.target.value)}
                    aria-describedby="bestemd-whatsapp-info"
                    required
                  />
                ) : (
                <input
                  id="bestemd-email"
                  type="email"
                  autoComplete="username"
                  maxLength={254}
                  placeholder="naam@voorbeeld.nl"
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value);
                    if (loginMethod !== "password" && emailStep === "verify") {
                      setEmailStep("request");
                      setEmailToken("");
                      setMessage("");
                    }
                  }}
                  readOnly={loginMethod !== "password" && emailStep === "verify"}
                  required
                />
                )}

                {loginMethod === "password" ? (
                  <>
                    <div className="bestemd-new-password-label">
                      <label htmlFor="bestemd-password">Wachtwoord</label>
                      <a href="/forgot-password">Vergeten?</a>
                    </div>
                    <input
                      id="bestemd-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Vul je wachtwoord in"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      required
                    />
                  </>
                ) : emailStep === "verify" ? (
                  <>
                    <label htmlFor="bestemd-email-token">{loginMethod === "whatsapp" ? "Inlogcode uit WhatsApp" : "Inlogcode uit je e-mail"}</label>
                    <input
                      id="bestemd-email-token"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6,8}"
                      minLength={6}
                      maxLength={8}
                      placeholder="Voer je code in"
                      value={emailToken}
                      onChange={event => setEmailToken(event.target.value.replace(/\D/g, "").slice(0, 8))}
                      required
                    />
                    <div className="bestemd-email-code-actions">
                      <button type="button" disabled={busy || resendSeconds > 0} onClick={() => void resendEmailCode()}>
                        {resendSeconds > 0 ? `Nieuwe code over ${resendSeconds}s` : "Code opnieuw verzenden"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => {
                        setEmailStep("request");
                        setEmailToken("");
                        setMessage("");
                      }}>
                        {loginMethod === "whatsapp" ? "Ander mobiel nummer" : "Ander e-mailadres"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p id={loginMethod === "whatsapp" ? "bestemd-whatsapp-info" : undefined} className="bestemd-email-code-hint">
                    {loginMethod === "whatsapp"
                      ? whatsappEnabled
                        ? "We sturen een code via WhatsApp naar het geverifieerde mobiele nummer van je BESTEMD-account. Daarna blijft je Authenticator verplicht."
                        : "WhatsApp-inloggen wordt voorbereid. Gebruik voorlopig Wachtwoord of E-mailcode. Je Authenticator blijft verplicht."
                      : "We sturen een code naar je e-mailadres."}
                  </p>
                )}
              </div>

              {message && (
                <p role="status" className="bestemd-new-error">{message}</p>
              )}

              <button type="submit" className="bestemd-new-button" disabled={busy || (loginMethod === "whatsapp" && !whatsappEnabled)}>
                {busy
                  ? "Even geduld..."
                  : loginMethod === "password"
                    ? "Inloggen"
                    : loginMethod === "whatsapp" && !whatsappEnabled
                      ? "Binnenkort beschikbaar"
                    : emailStep === "request"
                      ? "Verstuur inlogcode"
                      : "Inloggen met code"}
                {!busy && <ArrowRight size={19} />}
              </button>

              <div className="bestemd-new-security">
                <ShieldCheck size={16} />
                <span>Beveiligde verbinding</span>
              </div>
            </form>
          )}
          {stage === "mfa" && (
            <div className="bestemd-new-mfa">
              <Mfa onComplete={refresh} />
            </div>
          )}

          {stage === "choice" && (
            <div className="bestemd-new-form">
              <span className="bestemd-new-icon"><Compass size={22} /></span>
              <h1>Waar wil jij naartoe?</h1>
              <p>Kies jouw omgeving.</p>

              <div className="bestemd-new-choices">
                {access.business && (
                  <a href="/mijn-onderneming" className="bestemd-new-choice">
                    <BriefcaseBusiness size={24} />
                    <span>
                      <strong>Mijn Onderneming</strong>
                      <small>Administratie en inzicht</small>
                    </span>
                    <ArrowRight size={18} />
                  </a>
                )}

                {access.personal && (
                  <a href="/mijn-bestemming" className="bestemd-new-choice">
                    <Compass size={24} />
                    <span>
                      <strong>Mijn Bestemming</strong>
                      <small>Jouw persoonlijke omgeving</small>
                    </span>
                    <ArrowRight size={18} />
                  </a>
                )}
              </div>
            </div>
          )}

          {stage === "error" && (
            <div className="bestemd-new-form">
              <span className="bestemd-new-icon"><LockKeyhole size={22} /></span>
              <h1>Even niet beschikbaar.</h1>
              <p role="alert">{message}</p>
              <button
                type="button"
                className="bestemd-new-button"
                onClick={() => void refresh()}
              >
                Opnieuw proberen <ArrowRight size={18} />
              </button>
            </div>
          )}
        </section>

        <aside className="bestemd-route" aria-label="Landschap van Mijn Bestemming">
  <div className="bestemd-route-art" aria-hidden="true">
    <div className="bestemd-landscape" />
  </div>
</aside>
        <footer className="bestemd-new-footer">
          <span>Financiële rust. Ruimte om vooruit te kijken.</span>
          <span>© {new Date().getFullYear()} BESTEMD</span>
        </footer>
      </div>
    </main>
  );
}