import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError } from "@/lib/portal-access";

export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    const body = await readBody(request);

    if (
      typeof body.email !== "string" ||
      body.email.trim().length === 0 ||
      body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    ) {
      throw new AccessError(400, "Vul een geldig e-mailadres in.");
    }

    const email = body.email.trim();

    // Nooit automatisch nieuwe accounts aanmaken.
    // Geen gebruikersinformatie prijsgeven in de respons.
    try {
      await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      });
    } catch {
      // Ook bij een onbekend account dezelfde neutrale respons.
    }

    return Response.json({
      ok: true,
      message: "Als dit e-mailadres bekend is, ontvang je een inlogcode.",
    });
  });
}