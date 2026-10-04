import {
  portalApi,
  readBody,
} from "@/lib/portal-api";

import {
  AccessError,
} from "@/lib/portal-access";

import {
  contextCookie,
} from "@/lib/supabase/server";

export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({
      client,
      setCookie,
    }) => {
      const body =
        await readBody(request);

      const password =
        typeof body.password ===
        "string"
          ? body.password
          : "";

      const confirmPassword =
        typeof body.confirmPassword ===
        "string"
          ? body.confirmPassword
          : "";

      if (
        password.length < 12 ||
        password.length > 128
      ) {
        throw new AccessError(
          400,
          "Kies een wachtwoord van minimaal 12 tekens.",
        );
      }

      if (
        password !==
        confirmPassword
      ) {
        throw new AccessError(
          400,
          "De wachtwoorden zijn niet gelijk.",
        );
      }

      const {
        data: {
          user,
        },
        error: userError,
      } =
        await client.auth
          .getUser();

      if (
        userError ||
        !user
      ) {
        throw new AccessError(
          401,
          "Deze herstel-link is verlopen of ongeldig. Vraag een nieuwe herstelmail aan.",
        );
      }

      const { error } =
        await client.auth
          .updateUser({
            password,
          });

      if (error) {
        throw new AccessError(
          400,
          error.message ||
            "Het wachtwoord kon niet worden gewijzigd.",
        );
      }

      /*
       * Recovery-sessie niet als normale portalsessie
       * laten voortbestaan.
       * Daarna opnieuw inloggen + MFA.
       */
      await client.auth.signOut({
        scope: "local",
      });

      setCookie(
        contextCookie,
        "",
        {
          maxAge: 0,
        },
      );

      return Response.json({
        ok: true,
      });
    },
  );
}
