import type { SupabaseClient } from "@supabase/supabase-js";

type SecurityBinding = {
  verifySession(token: string): Promise<{
    userId: string;
    sessionId: string;
    mfaVerifiedAtSeconds: number;
  } | null>;
  inspectRegisteredSession?(token: string): Promise<{
    userId: string;
    sessionId: string;
    mfaVerifiedAtSeconds: number;
    status: string;
    revoked: boolean;
    registered: true;
  } | null>;
};

type ExpectedSession = {
  userId: string;
  sessionId: string;
  mfaVerifiedAtSeconds: number;
};

export async function verifyMfaViaInternalWorker(
  client: SupabaseClient,
  expected: ExpectedSession,
  getBinding: () => Promise<SecurityBinding | null>,
): Promise<boolean> {
  try {
    if (
      !client ||
      !expected ||
      typeof getBinding !== "function"
    ) return false;

    const { data, error } = await client.auth.getSession();

    if (
      error ||
      typeof data?.session?.access_token !== "string" ||
      !data.session.access_token
    ) return false;

    const binding = await getBinding();
    if (!binding) return false;

    const result = await binding.verifySession(
      data.session.access_token
    );

    return !!result &&
      result.userId === expected.userId &&
      result.sessionId === expected.sessionId &&
      result.mfaVerifiedAtSeconds === expected.mfaVerifiedAtSeconds;
  } catch {
    return false;
  }
}

/**
 * Schaduwcontrole. Standaard uitgeschakeld.
 * De uitkomst mag voorlopig geen toegang verlenen.
 */
export async function runMfaShadowVerification(
  client: SupabaseClient,
  expected: ExpectedSession,
): Promise<void> {
  if (process.env.BESTEMD_SECURITY_SHADOW_VERIFY !== "true") {
    return;
  }

  const shadowVerified = await verifyMfaViaInternalWorker(
    client,
    expected,
    async () => {
      try {
        const { env } = await import("cloudflare:workers");

        const binding = (
          env as unknown as {
            BESTEMD_SECURITY?: SecurityBinding;
          }
        ).BESTEMD_SECURITY;

        return typeof binding?.verifySession === "function"
          ? binding
          : null;
      } catch {
        return null;
      }
    },
  );

  // Aanvullende database-inspectie: alleen opt-in en niet-afdwingend.
  // Deze controle mag niet worden gebruikt om toegang te verlenen.
  if (
    shadowVerified &&
    process.env.BESTEMD_SECURITY_SHADOW_INSPECT === "true"
  ) {
    try {
      const { data, error } = await client.auth.getSession();

      if (!error && data?.session?.access_token) {
        const { env } = await import("cloudflare:workers");

        const binding = (
          env as unknown as {
            BESTEMD_SECURITY?: SecurityBinding;
          }
        ).BESTEMD_SECURITY;

        if (typeof binding?.inspectRegisteredSession === "function") {
          const inspected = await binding.inspectRegisteredSession(
            data.session.access_token
          );

          // Resultaat bewust niet gelogd of gebruikt voor autorisatie.
          // Ook 'active' betekent hier nog NIET dat de
          // netwerkvertrouwenscontrole is geslaagd.
          void (
            inspected?.userId === expected.userId &&
            inspected?.sessionId === expected.sessionId &&
            inspected?.mfaVerifiedAtSeconds ===
              expected.mfaVerifiedAtSeconds &&
            inspected?.registered === true &&
            inspected?.status === "active" &&
            inspected?.revoked === false
          );
        }
      }
    } catch {
      // Schaduwcontrole mag de bestaande MFA-flow niet verstoren.
    }
  }

  // Bewust geen logs, databasewrites of toegangsbeslissingen.
}