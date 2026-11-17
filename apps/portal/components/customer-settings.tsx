"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, CircleAlert, LockKeyhole, MessageCircle, ShieldCheck, Smartphone, UserRound } from "lucide-react";

type Settings = {
  displayName: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  phonePending: boolean;
  chatConsent: boolean;
  otpLoginReady: boolean;
  enrollmentReady: boolean;
};
const empty: Settings = { displayName: "", email: "", phone: "", phoneVerified: false, phonePending: false, chatConsent: false, otpLoginReady: false, enrollmentReady: false };

export default function CustomerSettings() {
  const [data, setData] = useState<Settings>(empty);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const res = await fetch("/api/account/settings", { cache: "no-store" });
    const result = await res.json() as Settings & { error?: string };
    if (!res.ok) throw new Error(result.error ?? "Je instellingen konden niet worden geladen.");
    setData(result);
    setName(result.displayName);
    setConsent(result.chatConsent);
    setPhone(result.phone || "");
    setPending(result.phonePending);
  }
  useEffect(() => {
    void refresh().catch(e => setError(e instanceof Error ? e.message : "Kan gegevens niet ophalen.")).finally(() => setLoading(false));
  }, []);

  async function submit(path: string, payload: object, onSuccess: (result: Record<string, unknown>) => void) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(path, { method: path === "/api/account/settings" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Opslaan is niet gelukt.");
      onSuccess(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verzoek mislukt.");
    } finally { setBusy(false); }
  }

  return (
    <div className="bestemd-settings">
      <section className="bestemd-settings-hero">
        <span className="bestemd-settings-eyebrow"><ShieldCheck size={15} /> MIJN BESTEMMING · ACCOUNT</span>
        <h1>Jouw gegevens & instellingen</h1>
        <p>Alles voor jouw profiel, bereikbaarheid en beveiliging. Overzichtelijk op één plek.</p>
        <div className="bestemd-settings-tags"><span><LockKeyhole size={14} /> Beveiligd met Authenticator</span><span><MessageCircle size={14} /> WhatsApp via BESTEMD</span></div>
      </section>
      {error && <p className="bestemd-settings-error" role="alert"><CircleAlert size={17} />{error}</p>}
      {message && <p className="bestemd-settings-success" role="status"><CheckCircle2 size={17} />{message}</p>}
      {loading ? <section className="bestemd-settings-panel">Jouw instellingen worden geladen…</section> : (
        <div className="bestemd-settings-grid">
          <section className="bestemd-settings-panel">
            <header><div className="bestemd-settings-icon"><UserRound /></div><div><h2>Persoonlijke gegevens</h2><p>De gegevens waarmee BESTEMD jou herkent.</p></div></header>
            <form onSubmit={e => { e.preventDefault(); void submit("/api/account/settings", { displayName: name, chatConsent: consent }, () => { setMessage("Jouw profielgegevens zijn opgeslagen."); void refresh(); }); }}>
              <label htmlFor="settings-name">Naam</label>
              <input id="settings-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} required />
              <label htmlFor="settings-email">E-mailadres / gebruikersnaam</label>
              <input id="settings-email" value={data.email} readOnly aria-readonly="true" />
              <p className="bestemd-settings-help">Het e-mailadres wijzigen gaat via een afzonderlijke beveiligde procedure.</p>
              <button className="bestemd-settings-primary" disabled={busy} type="submit">Wijzigingen opslaan <ChevronRight size={17}/></button>
            </form>
          </section>
          <section className="bestemd-settings-panel">
            <header><div className="bestemd-settings-icon bestemd-settings-icon-green"><Smartphone /></div><div><h2>Mobiel & WhatsApp</h2><p>Eén gecontroleerd nummer voor veilige communicatie.</p></div></header>
            <div className="bestemd-settings-status">
              {data.phoneVerified ? <><CheckCircle2 size={18} /> Nummer geverifieerd</> : <><CircleAlert size={18} /> Nog geen nummer geverifieerd</>}
            </div>
            <form onSubmit={e => { e.preventDefault(); void submit("/api/account/phone/request", { phone }, () => { setPending(true); setMessage("De verificatie is aangevraagd. Controleer je WhatsApp."); }); }}>
              <label htmlFor="settings-phone">WhatsApp-mobiel nummer</label>
              <input id="settings-phone" type="tel" autoComplete="tel" placeholder="06 12345678" maxLength={20} value={phone} onChange={e => { setPhone(e.target.value); setPending(false); setCode(""); }} disabled={!data.enrollmentReady || busy} required />
              {data.phoneVerified && <p className="bestemd-settings-help">Gekoppeld nummer: {data.phone}</p>}
              {!data.enrollmentReady && <p className="bestemd-settings-help">Het koppelen wordt beveiligd geactiveerd nadat de Meta- en Supabase-verzending zijn getest.</p>}
              {data.enrollmentReady && <button className="bestemd-settings-primary" disabled={busy} type="submit">Stuur verificatiecode <ChevronRight size={17}/></button>}
            </form>
            {pending && data.enrollmentReady && <form className="bestemd-settings-code" onSubmit={e => { e.preventDefault(); void submit("/api/account/phone/verify", { phone, token: code }, () => { setPending(false); setCode(""); setMessage("Je WhatsApp-nummer is veilig gekoppeld."); void refresh(); }); }}>
              <label htmlFor="settings-code">Zescijferige code uit WhatsApp</label>
              <input id="settings-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,"").slice(0,6))} required />
              <button className="bestemd-settings-primary" type="submit" disabled={busy}>Nummer bevestigen <ChevronRight size={17}/></button>
            </form>}
          </section>
          <section className="bestemd-settings-panel">
            <header><div className="bestemd-settings-icon"><MessageCircle /></div><div><h2>WhatsApp-gesprekken</h2><p>Jouw keuze voor communicatie met BESTEMD.</p></div></header>
            <div className="bestemd-settings-check">
              <input id="settings-chat-consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />
              <label htmlFor="settings-chat-consent">Ik geef BESTEMD toestemming om mijn geverifieerde WhatsApp-nummer te gebruiken voor zakelijke communicatie en het koppelen van mijn gesprekken aan mijn klantdossier.</label>
            </div>
            <p className="bestemd-settings-help">Deze voorkeur wordt bij je account bewaard. De daadwerkelijke koppeling met de Office-chatcentrale volgt afzonderlijk; gesprekken zijn niet zichtbaar voor andere klanten of ondernemingen.</p>
            <button className="bestemd-settings-secondary" type="button" disabled={busy} onClick={() => void submit("/api/account/settings", { displayName: name, chatConsent: consent }, () => { setMessage("Je communicatievoorkeur is opgeslagen."); void refresh(); })}>Communicatievoorkeur opslaan</button>
          </section>
          <section className="bestemd-settings-panel">
            <header><div className="bestemd-settings-icon"><LockKeyhole /></div><div><h2>Inloggen & beveiliging</h2><p>Zo houden we jouw gegevens afgeschermd.</p></div></header>
            <div className="bestemd-settings-security"><ShieldCheck size={19} /><div><strong>Authenticator blijft verplicht</strong><span>Ook wanneer je later met een WhatsApp-code inlogt.</span></div></div>
            <div className="bestemd-settings-security"><MessageCircle size={19} /><div><strong>WhatsApp-code</strong><span>{data.phoneVerified && data.otpLoginReady ? "Beschikbaar op jouw geverifieerde nummer" : "Nog niet geactiveerd voor dit account"}</span></div></div>
            <div className="bestemd-settings-security"><LockKeyhole size={19} /><div><strong>Wachtwoord en e-mailcode</strong><span>Blijven gewoon beschikbaar.</span></div></div>
          </section>
        </div>
      )}
    </div>
  );
}
