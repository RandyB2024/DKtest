"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileText, LifeBuoy, ShieldCheck, Umbrella } from "lucide-react";
import type { PortalContext, PortalOrganization } from "@/lib/portal-access";

type Policy = { id?: string; policy_number?: string; number?: string; provider?: string; insurer?: string; insurance_type?: string; type?: string; name?: string; status?: string };
function policiesFromResponse(data: unknown): Policy[] {
  if (Array.isArray(data)) return data.filter(x => x && typeof x === "object");
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const values = o.policies ?? o.insurances ?? o.items;
  return Array.isArray(values) ? values.filter(x => x && typeof x === "object") as Policy[] : [];
}
export default function InsuranceOverview({ context, organization, onGo }: {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo: (view: string) => void;
}) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!organization || context.organizationId === "all") { setPolicies([]); return; }
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch("/api/insurance/overview?organizationId=" + encodeURIComponent(organization.id), {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async r => {
      const data: unknown = await r.json();
      if (!r.ok) throw new Error("De verzekeringsgegevens zijn momenteel niet beschikbaar.");
      if (!controller.signal.aborted) setPolicies(policiesFromResponse(data));
    }).catch(() => { if (!controller.signal.aborted) setError("De verzekeringsgegevens konden niet worden geladen."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organization?.id, context.organizationId]);

  return <div className="bestemd-insurance">
    <section className="bestemd-insurance-hero">
      <div className="bestemd-insurance-mark"><Umbrella size={30}/></div>
      <div><span>BESTEMD · VERZEKERINGEN</span><h1>Goed verzekerd, helder geregeld.</h1>
        <p>Inzicht in geregistreerde verzekeringen van jouw onderneming, wanneer deze via Assurantiekantoor Klaas Vis worden beheerd.</p></div>
    </section>
    {!organization || context.organizationId === "all" ? <section className="bestemd-insurance-empty">
      <h2>Kies eerst een onderneming</h2><p>Verzekeringsgegevens worden uitsluitend per geselecteerde onderneming getoond.</p>
    </section> : loading ? <section className="bestemd-insurance-empty"><p>Verzekeringen worden geladen…</p></section>
      : error ? <section className="bestemd-insurance-empty" role="alert"><h2>Even niet beschikbaar</h2><p>{error}</p></section>
      : policies.length ? <section className="bestemd-insurance-policies"><h2>Geregistreerde verzekeringen</h2><div className="bestemd-insurance-list">{policies.map((p,i)=><article key={p.id || String(i)}>
          <span className="bestemd-insurance-mark bestemd-insurance-mark-small"><ShieldCheck size={20}/></span>
          <div><strong>{p.insurance_type || p.type || p.name || "Verzekering"}</strong><small>{p.insurer || p.provider || "Verzekeraar niet vermeld"}{p.policy_number || p.number ? " · Polis " + (p.policy_number || p.number) : ""}</small></div>
          <span>{p.status || "Geregistreerd"}</span>
        </article>)}</div></section>
      : <section className="bestemd-insurance-empty">
        <span className="bestemd-insurance-empty-icon"><Umbrella size={29}/></span>
        <h2>Nog geen verzekeringen geregistreerd</h2>
        <p>Er zijn op dit moment geen verzekeringen zichtbaar voor {organization.name}. Dit zegt niets over eventuele verzekeringen bij andere adviseurs.</p>
      </section>}
    <div className="bestemd-insurance-actions">
      <button type="button" onClick={()=>onGo("Communicatie")}><LifeBuoy size={22}/><span><strong>Contact met BESTEMD</strong><small>Stel een vraag over jouw verzekeringsgegevens.</small></span><ArrowRight size={18}/></button>
      <button type="button" onClick={()=>onGo("Documenten")}><FileText size={22}/><span><strong>Mijn documenten</strong><small>Bekijk jouw beschikbare documenten.</small></span><ArrowRight size={18}/></button>
    </div>
    <p className="bestemd-insurance-disclaimer">Verzekeringsadvies, bemiddeling en polisbeheer worden uitsluitend verzorgd door Assurantiekantoor Klaas Vis. BESTEMD toont gegevens binnen jouw eigen klantomgeving.</p>
  </div>;
}
