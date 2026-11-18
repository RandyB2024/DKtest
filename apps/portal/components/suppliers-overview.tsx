"use client";
import { useEffect, useMemo, useState } from "react";
import { Building2, FileText, Link2Off, Search } from "lucide-react";
import type { PortalContext, PortalOrganization } from "@/lib/portal-access";

type Invoice = {
  id: string; invoiceNumber: string; invoiceDate: string; dueDate: string;
  creditor: { id: string; name: string }; totalCents: number;
  paidCents: number; outstandingCents: number; overdue: boolean;
};
type Payables = { summary?: {totalCents?:number;overdueCents?:number;count?:number}; items?: Invoice[] };
const euro=new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"});
const money=(v:number)=>euro.format((Number(v)||0)/100);
const day=(s:string)=>s?new Date(s+"T12:00:00").toLocaleDateString("nl-NL"):"—";

export default function SuppliersOverview({context,organization}:{
  context:PortalContext;organization?:PortalOrganization;
}) {
  const [data,setData]=useState<Payables|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(true);
  const [search,setSearch]=useState("");
  useEffect(()=>{
    let active=true;
    setData(null);setError("");setBusy(true);
    if(context.organizationId==="all"){
      setError("Selecteer één onderneming om de leveranciers en facturen te bekijken.");
      setBusy(false);
      return ()=>{active=false;};
    }
    fetch("/api/financial/payables?organizationId="+encodeURIComponent(context.organizationId),{cache:"no-store"})
      .then(async r=>{const v=await r.json();if(!r.ok)throw new Error(v.error||"Leveranciers konden niet worden geladen.");return v as Payables;})
      .then(v=>{if(active)setData(v);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Leveranciers konden niet worden geladen.");})
      .finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[context.organizationId]);
  const invoices=data?.items??[];
  const suppliers=useMemo(()=>{
    const groups=new Map<string,{name:string;open:number;paid:number;count:number;overdue:number}>();
    for(const item of invoices){
      const id=item.creditor?.id||item.creditor?.name||item.id;
      const current=groups.get(id)||{name:item.creditor?.name||"Onbekende leverancier",open:0,paid:0,count:0,overdue:0};
      current.open+=Number(item.outstandingCents)||0;current.paid+=Number(item.paidCents)||0;
      current.count++;if(item.overdue)current.overdue++;
      groups.set(id,current);
    }
    return [...groups.values()].filter(v=>v.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,"nl"));
  },[invoices,search]);
  return <div className="relations-suppliers-page">
    <div className="heading"><div><h1>Leveranciers</h1>
      <p>Facturen en openstaande verplichtingen van {organization?.name||"de geselecteerde onderneming"}.</p></div></div>
    {error&&<section className="card" role="alert">{error}</section>}
    {busy&&<section className="card" role="status">Leveranciers worden geladen…</section>}
    {!busy&&data&&<>
      <section className="grid metrics">
        <article className="card metric"><label>Openstaand</label><strong>{money(data.summary?.totalCents||0)}</strong><span>{data.summary?.count||0} openstaande facturen</span></article>
        <article className="card metric"><label>Vervallen</label><strong>{money(data.summary?.overdueCents||0)}</strong><span>Volgens de boekhouding</span></article>
        <article className="card metric"><label>Reeds betaald (deels)</label><strong>{money(invoices.reduce((s,i)=>s+(Number(i.paidCents)||0),0))}</strong><span>Alleen betalingen op nog openstaande facturen</span></article>
      </section>
      <section className="card">
        <div className="section-heading"><div><h2>Leveranciersoverzicht</h2><p>Alleen leveranciers met momenteel openstaande facturen.</p></div></div>
        <label className="inventory-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek leverancier" aria-label="Zoek leverancier"/></label>
        <div className="inventory-list">
          {suppliers.map((s,i)=><article key={s.name+i} className="inventory-row">
            <div><small><Building2 size={16}/> Leverancier</small><strong>{s.name}</strong>
              <small>{s.count} openstaande facturen · {s.overdue} vervallen</small>
              <small><Link2Off size={14}/> Automatische koppeling niet bevestigd</small>
            </div>
            <div><small>Openstaand</small><strong>{money(s.open)}</strong><small>Deels betaald: {money(s.paid)}</small></div>
          </article>)}
          {!suppliers.length&&<p>Er zijn geen leveranciers met openstaande facturen gevonden.</p>}
        </div>
      </section>
      <section className="card">
        <h2>Facturen</h2>
        <div className="invoice-list">{invoices.filter(i=>(i.creditor?.name||"").toLowerCase().includes(search.toLowerCase())).map(i=><article key={i.id} className="invoice-row">
          <div><FileText size={17}/><strong>{i.creditor?.name||"Leverancier"}</strong><small>Factuur {i.invoiceNumber}</small></div>
          <div><small>Factuurdatum</small><strong>{day(i.invoiceDate)}</strong></div>
          <div><small>Vervaldatum</small><strong>{day(i.dueDate)}</strong></div>
          <div><small>Betaald</small><strong>{money(i.paidCents)}</strong></div>
          <div><small>Openstaand</small><strong>{money(i.outstandingCents)}</strong></div>
          <span className={"status "+(i.overdue?"bad":"")}>{i.overdue?"Vervallen":"Openstaand"}</span>
        </article>)}</div>
      </section>
      <p className="micro">Historisch volledig betaalde facturen, leverancierlogo’s en automatische factuurimport (zoals Ziggo/KPN) worden pas getoond zodra de betreffende verbinding en boekhoudgegevens daadwerkelijk beschikbaar zijn.</p>
    </>}
  </div>;
}
