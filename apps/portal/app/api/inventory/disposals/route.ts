import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";
import { portalApi, readBody } from "@/lib/portal-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = new Set(["sold", "discarded", "broken", "stolen", "lost", "other"]);

export async function GET(request: Request) {
  return portalApi(request, async ({ client }) => {
    const identity = await requirePortalIdentity(client);
    requireAal2(identity);
    const url = new URL(request.url);
    const organizationId = requireOrganization(identity, url.searchParams.get("organizationId"));
    const itemId = url.searchParams.get("itemId");
    if (!itemId || !uuid.test(itemId)) throw new AccessError(400, "Ongeldig bedrijfsmiddel.");
    const { data, error } = await client.from("inventory_disposal_requests")
      .select("id,inventory_item_id,reason,effective_date,sale_amount_cents,status,created_at")
      .eq("organization_id", organizationId).eq("inventory_item_id", itemId)
      .order("created_at", { ascending: false }).limit(1);
    if (error) throw new AccessError(503, "Afmelding kon niet worden geladen.");
    return Response.json({ item: data?.[0] ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  });
}

export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    const identity = await requirePortalIdentity(client);
    requireAal2(identity);
    const input = await readBody(request);
    const organizationId = requireOrganization(identity, input.organizationId);
    const itemId = input.itemId;
    const reason = input.reason;
    const effectiveDate = input.effectiveDate;
    const note = input.note ?? "";
    const sale = input.saleAmountCents ?? null;
    if (typeof itemId !== "string" || !uuid.test(itemId)) throw new AccessError(400, "Ongeldig bedrijfsmiddel.");
    if (typeof reason !== "string" || !reasons.has(reason)) throw new AccessError(400, "Selecteer een reden.");
    if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
      || Number.isNaN(Date.parse(`${effectiveDate}T12:00:00Z`))
      || new Date(`${effectiveDate}T12:00:00Z`).toISOString().slice(0,10) !== effectiveDate
      || effectiveDate > new Date().toISOString().slice(0,10)) {
      throw new AccessError(400, "Ongeldige afmelddatum.");
    }
    if (typeof note !== "string" || note.length > 1500) throw new AccessError(400, "Toelichting is te lang.");
    if (sale !== null && (!Number.isSafeInteger(sale) || (sale as number) < 0)) throw new AccessError(400, "Ongeldige verkoopprijs.");
    if (reason !== "sold" && sale !== null) throw new AccessError(400, "Verkoopprijs alleen bij verkoop.");
    const { data, error } = await client.from("inventory_disposal_requests").insert({
      organization_id: organizationId,
      inventory_item_id: itemId,
      requested_by: identity.profile.id,
      reason,
      effective_date: effectiveDate,
      sale_amount_cents: sale,
      note: note.trim(),
      status: "pending",
    }).select("id,status").single();
    if (error) {
      if (error.code === "23505") throw new AccessError(409, "Er staat al een afmelding ter beoordeling.");
      throw new AccessError(403, "Afmelding kon niet worden geregistreerd. Controleer de toegang en het bedrijfsmiddel.");
    }
    return Response.json({ item: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  });
}