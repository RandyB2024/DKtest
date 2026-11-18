"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, FileText, Car, Building2, ExternalLink, Mail } from "lucide-react";
import type { PortalContext,PortalOrganization } from "@/lib/portal-access";
import { hasVerifiedKlaasVisInsurance } from "@/lib/insurance-visibility";

/** This module is bound to the active organization's RLS-controlled insurance RPC.
 * Legacy insurance-module.tsx uses local fictional sample data and must never be mounted in production.
 */
type Row = Record<string,unknown>;
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter((v):v is Row=>typeof v==="object"&&v!==null&&!Array.isArray(v)):[];
const field=(v:Row,keys:string[])=>{for(const k of keys){if(typeof v[k]==="string"&&v[k])return String(v[k]);}return "";};
const date=(v:string)=>v&&/^\d{4}-\d{2}-\d{2}/.test(v)?new Date(v.slice(0,10)+"T12:00:00").toLocaleDateString("nl-NL"):"—";

export default function KlaasVisInsurance({context,organization}:{
  context:PortalContext;organization?:PortalOrganization;
}) {
  const [data,setData]=useState<Row|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;setData(null);setError("");setLoading(true);
    if(context.organizationId==="all"){setError("Selecteer één onderneming om de bijbehorende verzekeringsgegevens te bekijken.");setLoading(false);return()=>{active=false;};}
    fetch("/api/insurance/overview?organizationId="+encodeURIComponent(context.organizationId),{cache:"no-store"})
      .then(async r=>{const v=(await r.json()) as {error?:string};if(!r.ok)throw new Error(v.error||"Verzekeringsgegevens zijn momenteel niet beschikbaar.");return v as Row;})
      .then(v=>{if(active)setData(v);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Verzekeringen konden niet worden geladen.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[context.organizationId]);
  const sourcePolicies=rows(data?.policies??data?.verzekeringen);
  const sourceDocuments=rows(data?.documents??data?.polisdocumenten);
  const relationship=data?.relationship;
  const hasVerifiedLink=relationship&&typeof relationship==="object"&&!Array.isArray(relationship)
    ? (relationship as Row).verified===true || !!(relationship as Row).verified_at || !!(relationship as Row).verifiedAt
    : data?.verified===true || data?.linked===true;
  const policies=hasVerifiedLink?sourcePolicies:[];
  const documents=hasVerifiedLink?sourceDocuments:[];
  if (!loading && (error || !hasVerifiedKlaasVisInsurance(data))) return null;
  return <div className="insurance-live-page">
    <header className="insurance-hero">
      <div className="kv-brand"><img src="/klaas-vis-logo.png" alt="Klaas Vis"/>
        <div><span>Verzekeringen via Klaas Vis</span><h1>Uw verzekeringen</h1><p>{organization?.name||"Uw onderneming"} · Veilig polisoverzicht</p></div>
      </div>
      <div className="source-badge"><ShieldCheck size={17}/> Beheer via Assurantiekantoor Klaas Vis</div>
    </header>
    {loading&&<section className="card" role="status">Verzekeringsgegevens worden veilig geladen…</section>}
    {error&&<section className="card" role="alert">{error}</section>}
    {!loading&&!error&&<section className="grid metrics insurance-metrics">
      <article className="card metric"><label>Verzekeringen</label><strong>{policies.length}</strong><span>Gekoppelde polissen</span></article>
      <article className="card metric"><label>Polisstukken</label><strong>{documents.length}</strong><span>Beschikbare documentvermeldingen</span></article>
      <article className="card metric"><label>Relatiekoppeling</label><strong>{hasVerifiedLink?"Geverifieerd":"Niet bevestigd"}</strong><span>Per onderneming afgeschermd</span></article>
    </section>}
    {!loading&&!error&&<section className="card">
      <h2>Mijn verzekeringen</h2>
      {policies.length===0?<p>Er zijn voor deze onderneming nog geen geverifieerde polissen beschikbaar. BESTEMD toont geen fictieve polisgegevens.</p>:
      <div className="policy-grid">{policies.map((p,i)=><article className="card policy-card" key={field(p,["id","policyId","policy_id"])||i}>
        <div className="policy-icon">{/auto|motor|voertuig/i.test(field(p,["productName","product_name","name"]))?<Car/>:<Building2/>}</div>
        <div className="policy-main"><h3>{field(p,["productName","product_name","productType","name"])||"Verzekering"}</h3>
          <p>Polisnummer: {field(p,["policyNumber","policy_number"])||"Nog niet beschikbaar"}</p>
          <p>Status: {field(p,["status"])||"Onbekend"}</p>
          <p>Verzekeraar: {field(p,["insurer","insurerName","insurer_name"])||"Nog niet beschikbaar"}</p>
        </div>
      </article>)}</div>}
    </section>}
    {!loading&&!error&&<section className="card">
      <h2>Polisdocumenten</h2>
      {documents.length===0?<p>Er staan nog geen polisdocumenten voor deze onderneming klaar.</p>:
        <div className="invoice-list">{documents.map((d,i)=><div className="invoice-row" key={field(d,["id","documentId"])||i}>
          <FileText size={18}/><div><strong>{field(d,["name","filename","title"])||"Polisdocument"}</strong><small>Documentdatum: {date(field(d,["date","created_at","createdAt"]))}</small></div>
          <small>Veilige download beschikbaar zodra documenttoegang vanuit Office is aangesloten.</small>
        </div>)}</div>}
    </section>}
    <section className="card">
      <h2>Iets wijzigen of schade melden?</h2>
      <p>Voor poliswijzigingen, schademeldingen, offertes of advies kunt u rechtstreeks terecht bij Klaas Vis. Het versturen van een verzoek verandert de dekking niet automatisch.</p>
      <div className="insurance-action-links">
        <a className="btn" href="https://www.klaasvis.nl/wijziging-doorgeven/" target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/> Wijziging doorgeven</a>
        <a className="btn" href="https://www.klaasvis.nl/schademelden/" target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/> Schade melden</a>
        <a className="btn" href="https://www.klaasvis.nl/offerte-aanvragen/" target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/> Offerte aanvragen</a>
        <a className="btn" href="mailto:info@klaasvis.nl"><Mail size={17}/> Contact</a>
      </div>
    </section>
  </div>;
}
