import {
  portalApi,
} from "@/lib/portal-api";

import {
  requirePersonalIdentity,
} from "@/lib/personal-access";


export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePersonalIdentity(
          client,
        );

      if (!identity.aal2) {
        return Response.json({
          mfaRequired: true,
          code: "MFA_REQUIRED",
        });
      }

      return Response.json(
        identity,
      );
    },
  );
}
