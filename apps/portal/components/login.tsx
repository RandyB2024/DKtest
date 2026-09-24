"use client";
/* eslint-disable @next/next/no-img-element -- Static local brand asset; no image proxy. */
import { useState } from "react";
import { LockKeyhole } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as { error?: string };
      setPassword("");
      if (!response.ok) { setError(data.error ?? "Inloggen is niet gelukt."); return; }
      location.replace("/");
    } catch { setError("Inloggen is tijdelijk niet beschikbaar. Probeer het opnieuw."); }
    finally { setBusy(false); }
  }
  return <main className="login"><section className="login-aside"><img className="official-logo" src="/destination-known-logo.png" alt="Destination Known"/><h1>Uw administratie. Helder geregeld.</h1><p>Uw ondernemingen en persoonlijk contact met uw administratiekantoor — veilig bij elkaar.</p></section><section className="login-panel"><form className="login-box" onSubmit={submit}><LockKeyhole size={32} color="#0b4b78"/><h2>Welkom terug</h2><p>Log in bij Mijn Destination Known.</p><div className="field"><label htmlFor="email">E-mailadres</label><input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username"/></div><div className="field" style={{marginTop:14}}><label htmlFor="password">Wachtwoord</label><input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"/></div>{error && <p role="alert" style={{color:"#a23232"}}>{error}</p>}<button className="btn primary" style={{width:"100%",marginTop:18}} disabled={busy}>{busy ? "Inloggen…" : "Veilig inloggen"}</button><div className="notice">Gebruik uw persoonlijke account. Daarna volgt waar vereist tweestapsverificatie.</div></form></section></main>;
}
