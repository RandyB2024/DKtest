import "server-only";
import { env } from "cloudflare:workers";

import { createClient } from "@supabase/supabase-js";

type LockoutReservation = {
  reservation_id: string | null;
  allowed: boolean;
};

type LockoutCompletion = {
  accepted: boolean;
  is_locked: boolean;
  attempts: number;
  lock_expires_at: string | null;
};

function getAdminClient() {
  const url = (env as unknown as { NEXT_PUBLIC_SUPABASE_URL?: string }).NEXT_PUBLIC_SUPABASE_URL;
  const key = (env as unknown as { SUPABASE_SERVICE_ROLE_KEY?: string }).SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Loginbeveiliging is niet geconfigureerd.");
  }

  if (!url.startsWith("https://")) {
    throw new Error("Ongeldige Supabase-configuratie.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

export async function reserveLoginAttempt(
  email: string,
): Promise<LockoutReservation> {
  const admin = getAdminClient();

  const { data, error } = await admin.rpc(
    "bestemd_login_reserve_v1",
    { p_account_key: email.trim().toLowerCase() },
  );

  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("Loginreservering mislukt.");
  }

  const row = data[0] as LockoutReservation;

  if (
    typeof row.allowed !== "boolean" ||
    (row.allowed && !row.reservation_id)
  ) {
    throw new Error("Ongeldig reserveringsantwoord.");
  }

  return row;
}

export async function completeLoginAttempt(
  reservationId: string,
  success: boolean,
): Promise<LockoutCompletion> {
  const admin = getAdminClient();

  const { data, error } = await admin.rpc(
    "bestemd_login_complete_v1",
    {
      p_reservation_id: reservationId,
      p_success: success,
    },
  );

  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new Error("Afronding loginbeveiliging mislukt.");
  }

  const row = data[0] as LockoutCompletion;

  if (
    typeof row.accepted !== "boolean" ||
    typeof row.is_locked !== "boolean" ||
    !Number.isInteger(row.attempts)
  ) {
    throw new Error("Ongeldig afrondingsantwoord.");
  }

  return row;
}