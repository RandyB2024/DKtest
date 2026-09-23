import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/session";
import { canAccessInsuranceDocument, insuranceDocuments, policies } from "@/lib/insurance";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const userId = await requireSessionUser();
  if (!userId) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const { documentId } = await context.params;
  const document = insuranceDocuments.find(item => item.id === documentId);
  if (!document || !canAccessInsuranceDocument(userId, documentId)) return NextResponse.json({ error: "Geen toegang tot dit polisdocument." }, { status: 403, headers: { "cache-control": "no-store" } });
  const policy = policies.find(item => item.id === document.policyId);
  const content = [`Beveiligde lokale MVP-weergave`, document.name, `Polis: ${policy?.policyNumber ?? "onbekend"}`, `Documentdatum: ${document.date}`, `Versie: ${document.version}`, `Bron: ${document.source}`, `Productie: bytes worden na dezelfde servercontrole kortstondig uit private R2/DDI gestreamd.`].join("\r\n");
  return new Response(content, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${document.id}.txt"`, "cache-control": "private, no-store, max-age=0", pragma: "no-cache", "x-content-type-options": "nosniff" } });
}
