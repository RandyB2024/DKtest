import { portalApi } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";
import { requirePersonalIdentity } from "@/lib/personal-access";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/supabase/mfa-recovery";
import { createRecoveryAdminClient } from "@/lib/supabase/recovery-admin";
import { validatedTotp } from "@/lib/supabase/trusted-mfa";

export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    const { data: auth, error: authError } =
      await client.auth.getUser();

    if (authError || !auth.user) {
      throw new AccessError(401, "Log opnieuw in.");
    }

    const userId = auth.user.id;

    // Alleen gebruikers met toegang tot een BESTEMD-portaal.
    let authorized = false;

    try {
      await requirePortalIdentity(client);
      authorized = true;
    } catch (error) {
      if (error instanceof AccessError && error.status === 503) {
        throw error;
      }
    }

    if (!authorized) {
      await requirePersonalIdentity(client);
    }

    if (!(await validatedTotp(client, userId))) {
      throw new AccessError(
        403,
        "Bevestig eerst je identiteit met je authenticator.",
      );
    }

    const { data: factors, error: factorError } =
      await client.auth.mfa.listFactors();

    if (factorError) {
      throw new AccessError(
        503,
        "Authenticatorcontrole is niet beschikbaar.",
      );
    }

    if (!factors.totp.some((factor) => factor.status === "verified")) {
      throw new AccessError(
        403,
        "Er is geen geverifieerde authenticator.",
      );
    }

    const codes = generateRecoveryCodes();
    const hashes = codes.map((code) =>
      hashRecoveryCode(userId, code),
    );

    const admin = createRecoveryAdminClient();

    const { error: storeError } = await admin.rpc(
      "store_mfa_recovery_codes",
      {
        p_user_id: userId,
        p_hashes: hashes,
      },
    );

    if (storeError) {
      // Geen databasefout of gevoelige details teruggeven.
      throw new AccessError(
        409,
        "Herstelcodes konden niet worden uitgegeven. Mogelijk bestaan er al herstelcodes.",
      );
    }

    return Response.json(
      { codes },
      {
        headers: {
          "cache-control": "private, no-store",
        },
      },
    );
  });
}