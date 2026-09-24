"use client";
import { useState } from "react";
import { LayoutDashboard, FileText, FolderOpen, MessagesSquare, CalendarDays, ChartNoAxesCombined, ClipboardCheck, Bell, Building2, Settings, Car, Umbrella } from "lucide-react";
import type { PortalContext } from "@/lib/portal-access";
import Logout from "./logout";

const nav = [["Dashboard", LayoutDashboard], ["Facturen", FileText], ["Documenten", FolderOpen], ["Communicatie", MessagesSquare], ["Agenda", CalendarDays], ["Rapportages", ChartNoAxesCombined], ["Aangiften", ClipboardCheck], ["Voertuigen", Car], ["Verzekeringen", Umbrella], ["Notificaties", Bell], ["Bedrijfsprofiel", Building2], ["Instellingen", Settings]] as const;

export default function Portal({ context, onContext, onRefresh }: { context: PortalContext; onContext: (context: PortalContext) => void; onRefresh: () => Promise<void> }) {
  const [view, setView] = useState("Dashboard");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const organization = context.organizations.find(o => o.id === context.organizationId);
  const visible = context.organizationId === "all" ? context.organizations : context.organizations.filter(o => o.id === context.organizationId);
  async function switchOrganization(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId: id }) });
      const data = await response.json() as PortalContext & { error?: string };
      if (!response.ok) { await onRefresh(); throw new Error(data.error); }
      onContext(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Onderneming wisselen is niet gelukt."); }
    finally { setBusy(false); }
  }
  const switcher = context.organizations.length > 1 && <div className="field"><label htmlFor="organization">Huidige onderneming</label><select id="organization" disabled={busy} value={context.organizationId} onChange={e => switchOrganization(e.target.value)}><option value="all">Alle ondernemingen</option>{context.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>;
  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="mark">DK</span><div><strong>Mijn Destination Known</strong><small>{context.profile.display_name}</small></div></div><nav className="nav" aria-label="Hoofdnavigatie">{nav.map(([label, Icon]) => <button key={label} className={view === label ? "active" : ""} onClick={() => setView(label)}><Icon/><span>{label}</span></button>)}</nav><div className="sidebar-foot">Beveiligd klantportaal<br/><strong>{context.aal2 ? "Tweestapsverificatie bevestigd" : "Aangemeld"}</strong></div></aside><main className="main"><header className="topbar"><div>{switcher || <strong>{organization?.name}</strong>}</div><div className="profile"><div className="avatar">{context.profile.display_name.split(" ").map(p => p[0]).slice(0, 2).join("")}</div><div className="profile-text"><strong>{context.profile.display_name}</strong><small>{organization?.name ?? "Alle ondernemingen"}</small></div><Logout /></div></header><div className="content">{error && <p className="notice" role="alert">{error}</p>}<div className="heading"><div><h1>{view}</h1><p>{organization?.name ?? "Alle toegankelijke ondernemingen"}</p></div></div>{view === "Instellingen" ? <section className="card"><h2>Uw profiel</h2><p>{context.profile.display_name}</p><p>{context.profile.email}</p><p>Account actief · {context.memberships.length} actieve ondernemingskoppeling(en)</p><div className="notice">Profielwijzigingen, uitnodigingen en gebruikersbeheer zijn nog niet gemigreerd en zijn uitgeschakeld.</div></section> : view === "Bedrijfsprofiel" || view === "Dashboard" ? <>{view === "Dashboard" && <div className="notice">Uw profiel en ondernemingen worden uit Supabase geladen. Financiële dashboards en overige modules zijn nog niet gemigreerd; er worden geen democijfers getoond.</div>}<section className="grid">{visible.map(o => <article className="card" key={o.id}><h2>{o.name}</h2><p>{o.legal_name || "Juridische naam niet ingevuld"}</p><p>KvK: {o.registration_number || "Niet ingevuld"}</p><small>Actieve ondernemingskoppeling</small>{context.organizationId === "all" && <p><button className="btn" disabled={busy} onClick={() => switchOrganization(o.id)}>Onderneming openen</button></p>}</article>)}</section></> : <section className="card"><h2>Nog niet gemigreerd</h2><p>{view} is tijdelijk niet beschikbaar. Deze module wordt afzonderlijk op Supabase aangesloten en beveiligd voordat u gegevens kunt lezen of wijzigen.</p><p>Er worden geen lokale wijzigingen of gesimuleerde verzendingen opgeslagen.</p></section>}</div></main><nav className="mobile-nav" aria-label="Mobiele navigatie">{nav.slice(0, 4).map(([label, Icon]) => <button key={label} className={view === label ? "active" : ""} onClick={() => setView(label)}><Icon/><span>{label}</span></button>)}<button onClick={() => setView("Instellingen")}><Settings/><span>Profiel</span></button></nav></div>;
}
