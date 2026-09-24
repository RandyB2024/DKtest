"use client";
/* eslint-disable @next/next/no-img-element -- Enrollment QR must stay in this browser, never pass through an image optimizer. */
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Logout from "./logout";

type Factor = { id: string; name: string };
export default function Mfa({ onComplete }: { onComplete: () => Promise<void> }) {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorId, setFactorId] = useState("");
  const [setup, setSetup] = useState<{ qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/mfa", { cache: "no-store" }).then(async response => {
      const data = await response.json() as { error?: string; factors: Factor[] };
      if (!response.ok) throw new Error(data.error);
      if (active) { setFactors(data.factors); setFactorId(data.factors[0]?.id ?? ""); }
    }).catch(() => { if (active) setError("Tweestapsverificatie kan niet worden geladen. Herlaad de pagina of log opnieuw in."); });
    return () => { active = false; };
  }, []);
  async function act(action: "enroll" | "verify") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, factorId, code }) });
      const data = await response.json() as { error?: string; factorId: string; qrCode: string; secret: string };
      if (!response.ok) throw new Error(data.error);
      if (action === "enroll") { setFactorId(data.factorId); setSetup({ qrCode: data.qrCode, secret: data.secret }); }
      else { setSetup(null); setCode(""); await onComplete(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Verificatie is niet gelukt."); }
    finally { setBusy(false); }
  }
  return <main className="login"><section className="login-aside"><img className="official-logo" src="/destination-known-logo.png" alt="Destination Known"/><h1>Een extra stap voor uw veiligheid.</h1><p>Bevestig uw identiteit voordat u het klantportaal opent.</p></section><section className="login-panel"><div className="login-box"><ShieldCheck size={32}/><h2>Tweestapsverificatie</h2>{!factors && !error && <p>Authenticator controleren…</p>}{factors?.length === 0 && !setup && <><p>Koppel een authenticator-app. U krijgt een QR-code die u met de app scant.</p><button className="btn primary" disabled={busy} onClick={() => act("enroll")}>Authenticator instellen</button></>}{setup && <><p>Scan deze QR-code met uw authenticator-app. Deel deze code met niemand.</p><img width={220} height={220} src={setup.qrCode.startsWith("data:image/") ? setup.qrCode : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrCode)}`} alt="QR-code voor uw authenticator"/><details><summary>Handmatig instellen</summary><code style={{ overflowWrap: "anywhere" }}>{setup.secret}</code></details></>}{factorId && <form onSubmit={e => { e.preventDefault(); void act("verify"); }}>{factors && factors.length > 1 && <div className="field"><label htmlFor="factor">Authenticator</label><select id="factor" value={factorId} onChange={e => setFactorId(e.target.value)}>{factors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>}<p>Vul de actuele zescijferige code uit uw authenticator-app in.</p><div className="field"><label htmlFor="totp">Verificatiecode</label><input id="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}/></div><button className="btn primary" style={{ marginTop: 16 }} disabled={busy}>{busy ? "Controleren…" : "Verifiëren"}</button></form>}{error && <p role="alert">{error}</p>}<p>Authenticator kwijt? Neem contact op met uw beheerder. De verificatie kan hier niet worden overgeslagen.</p><Logout /></div></section></main>;
}
