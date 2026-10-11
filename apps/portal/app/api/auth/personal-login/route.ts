import {
  portalApi,
  readBody,
} from "@/lib/portal-api";

import {
  AccessError,
} from "@/lib/portal-access";

import {
  requirePersonalIdentity,
} from "@/lib/personal-access";


export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const body =
        await readBody(
          request,
        );

      const denied =
        () =>
          new AccessError(
            401,
            "Inloggen is niet gelukt. Controleer uw gegevens of neem contact op met Bestemd.",
          );


      if (
        typeof body.email !==
          "string" ||
        typeof body.password !==
          "string" ||
        !body.email.trim() ||
        !body.password ||
        body.email.length > 254 ||
        body.password.length > 1024
      ) {
        throw denied();
      }


      const {
        error,
      } =
        await client.auth
          .signInWithPassword({
            email:
              body.email.trim(),

            password:
              body.password,
          });


      if (error) {
        throw denied();
      }


      try {
        await requirePersonalIdentity(
          client,
        );
      } catch (error) {
        await client.auth.signOut({
          scope: "local",
        });

        if (
          error instanceof
            AccessError &&
          error.status === 503
        ) {
          throw error;
        }

        throw denied();
      }


      return Response.json({
        ok: true,
        redirectTo:
          "/mijn-bestemming",
      });
    },
  );
}
