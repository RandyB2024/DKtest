"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Send, FileText, Trash2 } from "lucide-react";
import type { PortalContext, PortalOrganization } from "@/lib/portal-access";
import { expenseCategories, type ExpenseCategory } from "@/lib/expense-categories";

type Line = { id:string; date:string; supplier:string; category:ExpenseCategory; amount:string; vat:string; description:string;receipt_status?:string };
type Claim = {id:string;month:string;status:string;total_cents:number;created_at:string;private_iban:string|null};
type DbLine = {id:string;expense_date:string;supplier:string;category:ExpenseCategory;gross_cents:number;vat_cents:number;description:string|null;receipt_status:string};
type Evidence = {id:string;line_id:string;document_id:string;filename:string;checked_at:string|null};
type Mileage = {line_id:string;trip_date:string;route:string;business_reason:string;kilometers:number;rate_cents:number};
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
  const [activeStatus,setActiveStatus]=useState("draft");
  const [month,setMonth]=useState(monthNow());
  const [iban,setIban]=useState("");
  const [lines,setLines]=useState<Line[]>([blankLine()]);
  const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [mileage,setMileage]=useState<Mileage[]>([]);
  const [sourceLoaded,setSourceLoaded]=useState(false);
  const [uploading,setUploading]=useState<string|null>(null);
  const [trip,setTrip]=useState<Record<string,{route:string;reason:string;km:string;rate:string}>>({});
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

  async function uploadReceipt(lineId:string,file:File|null) {
    if(!file||!claimId)return;
    const allowed=["application/pdf","image/jpeg","image/png","image/heic","image/heif"];
    if(!allowed.includes(file.type)||file.size>15*1024*1024||file.size===0){
      setError("Gebruik een PDF-, JPG-, PNG- of HEIC-bestand van maximaal 15 MB.");return;
    }
    setUploading(lineId);setError("");
    try{
      const fd=new FormData();
      fd.set("organizationId",context.organizationId);
      fd.set("lineId",lineId);fd.set("file",file);
      const upload=await fetch("/api/financial/expenses/evidence",{method:"POST",body:fd});
      const value=await upload.json() as {evidenceId?:string;error?:string};
      if(!upload.ok||!value.evidenceId)throw new Error(value.error||"Uploaden mislukt.");
      await loadEvidence();
      setLines(rows=>rows.map(row=>row.id===lineId?{...row,receipt_status:"received"}:row));
      setEditing(false);
      setNotice("Bon gekoppeld. De kostenposten zijn tegen overschrijven beschermd.");
    }catch(e){setError(e instanceof Error?e.message:"Uploaden mislukt.");}
    finally{setUploading(null);}
  }
  async function loadEvidence(){
    if(!claimId)return;
    const r=await fetch("/api/financial/expenses?organizationId="+encodeURIComponent(context.organizationId)+"&claimId="+encodeURIComponent(claimId),{cache:"no-store"});
    if(!r.ok)return;
    const d=await r.json() as {evidence?:Evidence[];mileage?:Mileage[]};
    setEvidence(d.evidence??[]);setMileage(d.mileage??[]);
  }
  async function openEvidence(documentId:string){
    setError("");
    try{
      const response=await fetch("/api/documents/"+encodeURIComponent(documentId)+"/download?organizationId="+encodeURIComponent(context.organizationId),{cache:"no-store"});
      const body=await response.json() as {url?:string;error?:string};
      if(!response.ok||!body.url)throw new Error(body.error||"Bon kan niet worden geopend.");
      // Supabase provides a short-lived signed URL after MFA and company authorization.
      window.open(body.url,"_blank","noopener,noreferrer");
    }catch(e){setError(e instanceof Error?e.message:"Download mislukt.");}
  }
  async function saveTrip(line:Line) {
    const row=trip[line.id];
    if(!row||!row.route.trim()||!row.reason.trim())return setError("Vul het traject en de zakelijke reden in.");
    const km=Number(row.km.replace(",", ".")),rate=Math.round(Number(row.rate.replace(",","."))*100);
    if(!Number.isFinite(km)||km<=0||!Number.isFinite(rate)||rate<0) return setError("Ongeldige ritafstand of vergoeding.");
    try{
      const response=await fetch("/api/financial/expenses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        action:"mileage",organizationId:context.organizationId,lineId:line.id,date:line.date,route:row.route,reason:row.reason,kilometers:km,rateCents:rate
      })});
      const d=await response.json() as {error?:string};
      if(!response.ok)throw new Error(d.error||"Rittenoverzicht kon niet worden opgeslagen.");
      setNotice("Rittenoverzicht gekoppeld.");setEditing(false);await loadEvidence();
      setLines(rows=>rows.map(row=>row.id===line.id?{...row,receipt_status:"received"}:row));
    }catch(e){setError(e instanceof Error?e.message:"Rit opslaan mislukt.");}
  }
  async function openClaim(item:Claim) {
    setBusy(true);setError("");setEditing(false);
    try{
      const response=await fetch("/api/financial/expenses?organizationId="+encodeURIComponent(context.organizationId)+"&claimId="+encodeURIComponent(item.id),{cache:"no-store"});
      const payload=await response.json() as {lines?:DbLine[];evidence?:Evidence[];mileage?:Mileage[];error?:string};
      if(!response.ok)throw new Error(payload.error||"Declaratie niet gevonden.");
      setClaimId(item.id);setActiveStatus(item.status);setMonth(item.month);setIban(item.private_iban??"");
      setEvidence(payload.evidence??[]);setMileage(payload.mileage??[]);setSourceLoaded(true);
      setLines((payload.lines??[]).map(row=>({id:row.id,date:row.expense_date,supplier:row.supplier,category:row.category,amount:(row.gross_cents/100).toFixed(2),vat:(row.vat_cents/100).toFixed(2),description:row.description??"",receipt_status:row.receipt_status})));
      setRevision(0);setSavedRevision(0);setEditing(item.status==="draft"&&(payload.evidence??[]).length===0&&(payload.mileage??[]).length===0);
    }catch(e){setError(e instanceof Error?e.message:"Openen mislukt.");}finally{setBusy(false);}
  }
  async function submit(){
    setBusy(true);setError("");setNotice("");
    try {
      const id=editing?await save():claimId;
      if(!id)throw new Error("Controleer alle kostenposten en het privé-IBAN.");
      const res=await fetch("/api/financial/expenses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"submit",organizationId:context.organizationId,claimId:id})});
      const data=await res.json() as {status?:string;error?:string};
      if(!res.ok)throw new Error(data.error||"Indienen mislukt.");
      setEditing(false);setNotice("Declaratie ingediend: "+statusLabel(data.status||"submitted")+".");await reload();
      await openClaim({id,month,status:data.status||"submitted",total_cents:total,created_at:new Date().toISOString(),private_iban:iban});
    }catch(e){setError(e instanceof Error?e.message:"Indienen mislukt.");}finally{setBusy(false);}
  }
  const start=()=>{setClaimId(null);setActiveStatus("draft");setMonth(monthNow());setIban("");setLines([blankLine()]);setEvidence([]);setMileage([]);setSourceLoaded(false);setRevision(0);setSavedRevision(0);setEditing(true);setError("");setNotice("");};
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
      <div className="section-heading"><div><h2>{claimId?"Declaratie bekijken":"Nieuwe maanddeclaratie"}</h2><p>{editing?"Wijzigingen worden automatisch als concept opgeslagen.":"Gegevens zijn vergrendeld voor bewerking; bewijsstukken kunnen worden toegevoegd zolang de beoordeling loopt."}</p></div><strong>{toMoney(total)}</strong></div>
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
        <p className="micro">{line.category==="kilometervergoeding"?"Rittenoverzicht vereist; een leveranciersfactuur is niet nodig.":"Bewijsstuk per kostenpost vereist vóór verwerking."}</p>
        {sourceLoaded&&claimId&&["draft","submitted","waiting_evidence","under_review"].includes(activeStatus)&&line.category!=="kilometervergoeding"&&<div className="expenses-proof">
          <strong>Bewijsstukken</strong>
          {evidence.filter(d=>d.line_id===line.id).map(d=><button type="button" className="btn" key={d.id} onClick={()=>void openEvidence(d.document_id)}>{d.filename} · {d.checked_at?"Gecontroleerd":"Bon ontvangen"} · Openen</button>)}
          <label>Bon toevoegen (PDF, JPG, PNG, HEIC)
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif" disabled={uploading!==null} onChange={e=>{void uploadReceipt(line.id,e.target.files?.[0]??null);e.target.value="";}}/>
          </label>
        </div>}
        {sourceLoaded&&claimId&&["draft","submitted","waiting_evidence","under_review"].includes(activeStatus)&&line.category==="kilometervergoeding"&&<div className="expenses-proof">
          {mileage.some(m=>m.line_id===line.id)?<p>Rittenoverzicht ontvangen</p>:<p>Vul de ritgegevens in; bedrag = kilometers × tarief.</p>}
          <div className="expenses-fields">
            <label>Traject<input placeholder="Vertrek — bestemming" value={trip[line.id]?.route??""} onChange={e=>setTrip(v=>({...v,[line.id]:{route:e.target.value,reason:v[line.id]?.reason??"",km:v[line.id]?.km??"",rate:v[line.id]?.rate??""}}))}/></label>
            <label>Zakelijke reden<input value={trip[line.id]?.reason??""} onChange={e=>setTrip(v=>({...v,[line.id]:{route:v[line.id]?.route??"",reason:e.target.value,km:v[line.id]?.km??"",rate:v[line.id]?.rate??""}}))}/></label>
            <label>Kilometers<input inputMode="decimal" value={trip[line.id]?.km??""} onChange={e=>setTrip(v=>({...v,[line.id]:{route:v[line.id]?.route??"",reason:v[line.id]?.reason??"",km:e.target.value,rate:v[line.id]?.rate??""}}))}/></label>
            <label>Tarief €/km<input inputMode="decimal" value={trip[line.id]?.rate??""} onChange={e=>setTrip(v=>({...v,[line.id]:{route:v[line.id]?.route??"",reason:v[line.id]?.reason??"",km:v[line.id]?.km??"",rate:e.target.value}}))}/></label>
          </div>
          <button type="button" className="btn" onClick={()=>void saveTrip(line)}>Rit vastleggen</button>
        </div>}
      </div>)}
      {editing&&<div className="expenses-actions">
        <button type="button" className="btn" onClick={()=>changed([...lines,blankLine()])}><Plus size={17}/> Kostenpost toevoegen</button>
        <button type="button" className="btn" disabled={!valid||busy} onClick={()=>void save().then(()=>{setNotice("Concept bewaard.");void reload();}).catch(e=>setError(String(e)))}><Save size={17}/> Concept bewaren</button>
        <button type="button" className="btn primary" disabled={!valid||busy} onClick={()=>void submit()}><Send size={17}/> Indienen</button>
      </div>}
      {!editing&&sourceLoaded&&claims.find(c=>c.id===claimId)?.status==="draft"&&<button type="button" className="btn primary" disabled={busy} onClick={()=>void submit()}><Send size={17}/> Concept indienen</button>}
      {missing>0&&<p role="status"><FileText size={16}/> {missing} kostenpost(en) hebben nog geen bewijsstuk. Een ingediende declaratie krijgt de status Wacht op bewijsstukken.</p>}
    </section>}
  </section>;
}
