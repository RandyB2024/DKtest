import {
  portalApi,
  readBody,
} from "@/lib/portal-api";

export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const body =
        await readBody(request);

      const email =
        typeof body.email === "string"
          ? body.email.trim()
          : "";

      if (
        !email ||
        email.length > 254 ||
        !email.includes("@")
      ) {
        return Response.json({
          ok: true,
        });
      }

      const redirectTo =
        new URL(
          "/auth/recovery",
          request.url,
        ).toString();

      /*
       * Bewust geen onderscheid maken tussen:
       * - bestaand account
       * - onbekend e-mailadres
       * - Supabase auth response
       *
       * Zo kan niemand klant-e-mailadressen enumereren.
       */
      try {
        await client.auth
          .resetPasswordForEmail(
            email,
            {
              redirectTo,
            },
          );
      } catch {
        // Zelfde response houden.
      }

      return Response.json({
        ok: true,
      });
    },
  );
}
