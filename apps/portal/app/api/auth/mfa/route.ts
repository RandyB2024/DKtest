import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";

export async function GET(request: Request) {
  return portalApi(request, async ({ client }) => {
    await requirePortalIdentity(client);
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw new AccessError(503, "Tweestapsverificatie kan niet worden geladen.");
    return Response.json({ factors: data.totp.filter(f => f.status === "verified").map(f => ({ id: f.id, name: f.friendly_name ?? "Authenticator" })) });
  });
}
export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    await requirePortalIdentity(client);
    const body = await readBody(request);
    const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
    if (factorsError) throw new AccessError(503, "Tweestapsverificatie kan niet worden geladen.");
    if (body.action === "enroll") {
      if (factors.totp.some(f => f.status === "verified")) throw new AccessError(409, "Gebruik uw bestaande authenticator.");
      // Never remove a verified second factor.
      for (const factor of factors.all.filter(f => f.factor_type === "totp" && f.status === "unverified")) {
        const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw new AccessError(503, "Opnieuw instellen is niet gelukt.");
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Mijn Destination Known" });
      if (error) throw new AccessError(503, "Instellen is niet gelukt. Probeer het opnieuw.");
      // One-time enrollment material for this user; never log or persist it.
      return Response.json({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    }
    if (body.action !== "verify" || typeof body.factorId !== "string" || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) throw new AccessError(400, "Vul de zescijferige code in.");
    if (!factors.all.some(f => f.id === body.factorId && f.factor_type === "totp")) throw new AccessError(403, "Verificatie is niet gelukt.");
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: body.factorId, code: body.code });
    if (error) throw new AccessError(401, "De code is ongeldig of verlopen. Probeer de nieuwste code.");
    return Response.json({ ok: true });
  });
}
