"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Send, FileText, Trash2 } from "lucide-react";
import type { PortalContext, PortalOrganization } from "@/lib/portal-access";
import { expenseCategories, categoryName, type ExpenseCategory } from "@/lib/expense-categories";

type Line = { id:string; date:string; supplier:string; category:ExpenseCategory; amount:string; vat:string; description:string;receipt_status?:string };
type Claim = {id:string;month:string;status:string;total_cents:number;created_at:string;private_iban:string|null};
type DbLine = {id:string;expense_date:string;supplier:string;category:ExpenseCategory;gross_cents:number;vat_cents:number;description:string|null;receipt_status:string};
const monthNow=()=>new Date().toISOString().slice(0,7)+"-01";
const today=()=>new Date().toISOString().slice(0,10);
const blankLine=():Line=>({id:crypto.randomUUID(),date:today(),supplier:"",category:"kantoorartikelen",amount:"",vat:"0",description:""});
const cents=(value:string):number=>Math.round(Number(value.replace(",", "."))*100);
const toMoney=(n:number)=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(n/100);
const statusLabel=(v:string)=>({
  draft:"Concept",submitted:"Ingediend",waiting_evidence:"Wacht op bewijsstukken",
  under_review:"In controle",approved:"Goedgekeurd",rejected:"Afgewezen",
  booking_pending:"Wacht op boeking",booked:"Boekhoudkundig verwerkt",paid:"Uitbetaald"
} as Record<string,string>)[v]??v;

export default function ExpensesView({context,organization}:{context:PortalContext;organization?:PortalOrganization}) {
  const [claims,setClaims]=useState<Claim[]>([]);
  const [claimId,setClaimId]=useState<string|null>(null);
  const [month,setMonth]=useState(monthNow());
  const [iban,setIban]=useState("");
  const [lines,setLines]=useState<Line[]>([blankLine()]);
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);
  const [savedRevision,setSavedRevision]=useState(0);
  const saving=useRef<Promise<string|null>|null>(null);
  const canEdit=context.organizationId!=="all";
  const total=useMemo(()=>lines.reduce((sum,row)=>sum+(Number.isFinite(cents(row.amount))?Math.max(cents(row.amount),0):0),0),[lines]);
  const missing=lines.filter(x=>x.category!=="kilometervergoeding"&&x.receipt_status!=="received"&&x.receipt_status!=="checked").length;
  const valid=lines.length>0&&lines.every(x=>x.date&&x.supplier.trim().length>=2&&x.amount!==""&&Number.isFinite(cents(x.amount))&&cents(x.amount)>=0&&Number.isFinite(cents(x.vat))&&cents(x.vat)>=0&&cents(x.vat)<=cents(x.amount))&&/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban.replace(/\s/g,"").toUpperCase());

  async function reload() {
    if(!canEdit){setClaims([]);return;}
    const response=await fetch("/api/financial/expenses?organizationId="+encodeURIComponent(context.organizationId),{cache:"no-store"});
    const payload=await response.json() as {claims?:Claim[];error?:string};
    if(!response.ok)throw new Error(payload.error||"Declaraties kunnen niet worden geladen.");
    setClaims(payload.claims??[]);
  }
  useEffect(()=>{let alive=true;setEditing(false);setClaimId(null);setError("");setClaims([]);
    if(canEdit)void reload().catch(e=>{if(alive)setError(e instanceof Error?e.message:"Laden mislukt.");});
    return()=>{alive=false;};
  },[context.organizationId]);

  function changed(next:Line[]){setLines(next);setRevision(v=>v+1);}
  function update(id:string,patch:Partial<Line>){changed(lines.map(row=>row.id===id?{...row,...patch}:row));}
  async function save():Promise<string|null> {
    if(!canEdit||!valid)return null;
    if(saving.current)return saving.current;
    const snapshot=revision;
    const request=(async()=>{
      const response=await fetch("/api/financial/expenses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        action:"save",organizationId:context.organizationId,claimId,month,privateIban:iban,
        lines:lines.map(row=>({date:row.date,supplier:row.supplier,category:row.category,grossCents:cents(row.amount),vatCents:cents(row.vat),description:row.description}))
      })});
      const body=await response.json() as {claimId?:string;error?:string};
      if(!response.ok||!body.claimId)throw new Error(body.error||"Opslaan mislukt.");
      setClaimId(body.claimId);setSavedRevision(snapshot);
      return body.claimId;
    })();
    saving.current=request;
    try{return await request;}finally{saving.current=null;}
  }
  useEffect(()=>{
    if(!editing||!valid||revision===savedRevision||busy)return;
    const timer=setTimeout(()=>{void save().then(()=>setNotice("Concept automatisch opgeslagen")).catch(e=>setError(e instanceof Error?e.message:"Automatisch opslaan mislukt."));},1300);
    return()=>clearTimeout(timer);
  },[revision,month,iban,editing,valid,busy,savedRevision]);

  async function openClaim(item:Claim) {
    setBusy(true);setError("");setEditing(false);
    try{
      const response=await fetch("/api/financial/expenses?organizationId="+encodeURIComponent(context.organizationId)+"&claimId="+encodeURIComponent(item.id),{cache:"no-store"});
      const payload=await response.json() as {lines?:DbLine[];error?:string};
      if(!response.ok)throw new Error(payload.error||"Declaratie niet gevonden.");
      setClaimId(item.id);setMonth(item.month);setIban(item.private_iban??"");
      setLines((payload.lines??[]).map(row=>({id:row.id,date:row.expense_date,supplier:row.supplier,category:row.category,amount:(row.gross_cents/100).toFixed(2),vat:(row.vat_cents/100).toFixed(2),description:row.description??"",receipt_status:row.receipt_status})));
      setRevision(0);setSavedRevision(0);setEditing(item.status==="draft");
    }catch(e){setError(e instanceof Error?e.message:"Openen mislukt.");}finally{setBusy(false);}
  }
  async function submit(){
    setBusy(true);setError("");setNotice("");
    try {
      const id=await save();
      if(!id)throw new Error("Controleer alle kostenposten en het privé-IBAN.");
      const res=await fetch("/api/financial/expenses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"submit",organizationId:context.organizationId,claimId:id})});
      const data=await res.json() as {status?:string;error?:string};
      if(!res.ok)throw new Error(data.error||"Indienen mislukt.");
      setEditing(false);setNotice("Declaratie ingediend: "+statusLabel(data.status||"submitted")+".");await reload();
    }catch(e){setError(e instanceof Error?e.message:"Indienen mislukt.");}finally{setBusy(false);}
  }
  const start=()=>{setClaimId(null);setMonth(monthNow());setIban("");setLines([blankLine()]);setRevision(0);setSavedRevision(0);setEditing(true);setError("");setNotice("");};
  return <section className="expenses-page">
    <div className="heading"><div><h1>Declaraties</h1><p>Privé betaalde zakelijke kosten per onderneming en maand.</p></div>
      {canEdit&&<button className="btn primary" type="button" onClick={start}><Plus size={17}/> Nieuwe declaratie</button>}
    </div>
    <section className="card"><strong>{organization?.name??"Selecteer één onderneming"}</strong><p>Declarant: {context.profile.display_name}</p></section>
    {!canEdit&&<section className="card">Selecteer eerst één onderneming via de ondernemingskeuze bovenaan.</section>}
    {error&&<p className="notice" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
    {canEdit&&<section className="card"><h2>Maanddeclaraties</h2>
      {claims.length===0?<p>Er zijn nog geen declaraties voor deze onderneming.</p>:
      <div className="invoice-list">{claims.map(c=><button key={c.id} type="button" className="invoice-row" onClick={()=>void openClaim(c)}><span><strong>{c.month.slice(0,7)}</strong><small>{statusLabel(c.status)}</small></span><strong>{toMoney(c.total_cents)}</strong></button>)}</div>}
    </section>}
    {canEdit&&(editing||claimId)&&<section className="card expenses-editor">
      <div className="section-heading"><div><h2>{claimId?"Declaratie bekijken":"Nieuwe maanddeclaratie"}</h2><p>{editing?"Wijzigingen worden automatisch als concept opgeslagen.":"Ingediende declaratie (alleen lezen)."}</p></div><strong>{toMoney(total)}</strong></div>
      <div className="expenses-fields">
        <label>Declaratiemaand<input type="month" disabled={!editing} value={month.slice(0,7)} onChange={e=>{setMonth(e.target.value+"-01");setRevision(v=>v+1);}}/></label>
        <label>Privé-IBAN<input type="text" autoComplete="off" disabled={!editing} value={iban} placeholder="NL00BANK0123456789" onChange={e=>{setIban(e.target.value.toUpperCase());setRevision(v=>v+1);}}/></label>
      </div>
      {lines.map((line,i)=><div key={line.id} className="expenses-line">
        <div className="section-heading"><strong>Kostenpost {i+1}</strong><span>{line.category==="kilometervergoeding"?"Rittenoverzicht vereist":line.receipt_status==="checked"?"Gecontroleerd":line.receipt_status==="received"?"Bon ontvangen":"Bon ontbreekt"}</span>
        {editing&&lines.length>1&&<button type="button" className="btn" onClick={()=>changed(lines.filter(x=>x.id!==line.id))}><Trash2 size={15}/> Verwijderen</button>}</div>
        <div className="expenses-fields">
          <label>Datum<input type="date" disabled={!editing} value={line.date} onChange={e=>update(line.id,{date:e.target.value})}/></label>
          <label>Leverancier<input disabled={!editing} value={line.supplier} onChange={e=>update(line.id,{supplier:e.target.value})}/></label>
          <label>Kostensoort<select disabled={!editing} value={line.category} onChange={e=>update(line.id,{category:e.target.value as ExpenseCategory})}>{expenseCategories.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label>Bedrag incl. btw (€)<input inputMode="decimal" disabled={!editing} value={line.amount} onChange={e=>update(line.id,{amount:e.target.value})}/></label>
          <label>Waarvan btw (€)<input inputMode="decimal" disabled={!editing} value={line.vat} onChange={e=>update(line.id,{vat:e.target.value})}/></label>
          <label>Toelichting<input disabled={!editing} value={line.description} onChange={e=>update(line.id,{description:e.target.value})}/></label>
        </div>
        <p className="micro">{line.category==="kilometervergoeding"?"Een rittenoverzicht moet vóór boeking worden beoordeeld.":"Bewijsstuk kan na indiening worden toegevoegd. Boekhoudkundige verwerking blijft geblokkeerd totdat bewijs is gecontroleerd."}</p>
      </div>)}
      {editing&&<div className="expenses-actions">
        <button type="button" className="btn" onClick={()=>changed([...lines,blankLine()])}><Plus size={17}/> Kostenpost toevoegen</button>
        <button type="button" className="btn" disabled={!valid||busy} onClick={()=>void save().then(()=>{setNotice("Concept bewaard.");void reload();}).catch(e=>setError(String(e)))}><Save size={17}/> Concept bewaren</button>
        <button type="button" className="btn primary" disabled={!valid||busy} onClick={()=>void submit()}><Send size={17}/> Indienen</button>
      </div>}
      {missing>0&&<p role="status"><FileText size={16}/> {missing} kostenpost(en) hebben nog geen bewijsstuk. Een ingediende declaratie krijgt de status Wacht op bewijsstukken.</p>}
    </section>}
  </section>;
}
