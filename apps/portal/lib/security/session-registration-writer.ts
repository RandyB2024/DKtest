import { createClient } from "@supabase/supabase-js";

export type NetworkSessionRegistration = {
  userId: string;
  sessionId: string;
  mfaVerifiedAt: string;
  ip: string;
  latitude: number | null;
  longitude: number | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type ClientFactory = (
  url: string,
  key: string,
  options: Record<string, unknown>
) => RpcClient;

export function createSessionRegistrationWriter(
  config: {
    url: string | undefined;
    secretKey: string | undefined;
  },
  factory: ClientFactory = createClient as unknown as ClientFactory
) {
  return async function register(
    session: NetworkSessionRegistration
  ): Promise<boolean> {
    const { url, secretKey } = config;

    if (
      typeof url !== "string" ||
      !/^https:\/\//.test(url) ||
      typeof secretKey !== "string" ||
      !/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey)
    ) {
      return false;
    }

    if (
      !session ||
      !/^[0-9a-f-]{36}$/i.test(session.userId) ||
      !/^[0-9a-f-]{36}$/i.test(session.sessionId) ||
      typeof session.ip !== "string" ||
      !session.ip.trim() ||
      !Number.isFinite(Date.parse(session.mfaVerifiedAt)) ||
      !(
        (session.latitude === null && session.longitude === null) ||
        (
          typeof session.latitude === "number" &&
          typeof session.longitude === "number" &&
          Number.isFinite(session.latitude) &&
          Number.isFinite(session.longitude) &&
          session.latitude >= -90 &&
          session.latitude <= 90 &&
          session.longitude >= -180 &&
          session.longitude <= 180
        )
      )
    ) {
      return false;
    }

    try {
      const client = factory(url, secretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data, error } = await client.rpc(
        "bestemd_register_session_v1",
        {
          p_user_id: session.userId,
          p_session_id: session.sessionId,
          p_mfa_at: session.mfaVerifiedAt,
          p_ip: session.ip,
          p_latitude: session.latitude,
          p_longitude: session.longitude,
        }
      );

      return !error && data === true;
    } catch {
      // Geen geheimen of persoonsgegevens naar logs.
      return false;
    }
  };
}

// Alleen vanuit een vertrouwde serverroute aanroepen.
// De secret wordt pas tijdens de aanroep uit de runtime gelezen.
export function createRuntimeSessionRegistrationWriter() {
  return createSessionRegistrationWriter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  });
}