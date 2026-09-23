import { NextResponse } from "next/server";
import { can } from "@/lib/access";
import { generalInsuranceEmail, policies, validateInsuranceUpload } from "@/lib/insurance";
import { requireSessionUser } from "@/lib/session";

type RequestBody = { action?: "change" | "claim" | "message" | "advice"; organizationId?: string; policyId?: string; files?: Array<{ name: string; type: string; size: number }> };
const requiredPermission = { change: "insurance-change:submit", claim: "claim:submit", message: "insurance-message:send", advice: "insurance-advice:request" } as const;
export async function POST(request: Request) {
  const userId = await requireSessionUser();
  if (!userId) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as RequestBody;
  if (!body.action || !body.organizationId) return NextResponse.json({ error: "Ongeldig verzoek." }, { status: 400 });
  if (!can(userId, body.organizationId, requiredPermission[body.action])) return NextResponse.json({ error: "Geen bevoegdheid voor deze verzekeringsactie." }, { status: 403 });
  if (body.policyId && !policies.some(policy => policy.id === body.policyId && policy.organizationId === body.organizationId)) return NextResponse.json({ error: "Polis behoort niet tot deze onderneming." }, { status: 403 });
  const files = body.files ?? [];
  if (files.some(file => !validateInsuranceUpload(file))) return NextResponse.json({ error: "Ongeldig bestand." }, { status: 422 });
  const prefix = body.action === "claim" ? "KV-SCHADE" : body.action === "change" ? "KV-WIJZ" : body.action === "advice" ? "KV-ADVIES" : "KV-BERICHT";
  return NextResponse.json({ reference: `${prefix}-DEMO-${Date.now().toString().slice(-6)}`, status: body.action === "claim" ? "Gemeld" : "Ontvangen", definitive: false, emailNotification: generalInsuranceEmail, audit: { action: `insurance.${body.action}.created`, result: "success", sensitiveContentLogged: false } }, { status: 201, headers: { "cache-control": "no-store" } });
}
