import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reserveLoginAttempt,
  completeLoginAttempt,
} from "./login-lockout-admin";

export class LoginSecurityUnavailableError extends Error {
  constructor() {
    super("Loginbeveiliging tijdelijk niet beschikbaar.");
    this.name = "LoginSecurityUnavailableError";
  }
}

export async function guardedPasswordLogin(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<boolean> {
  let reservation: Awaited<
    ReturnType<typeof reserveLoginAttempt>
  >;

  try {
    reservation = await reserveLoginAttempt(email);
  } catch {
    throw new LoginSecurityUnavailableError();
  }

  if (!reservation.allowed || !reservation.reservation_id) {
    return false;
  }

  let authenticated = false;

  try {
    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    authenticated = !error;
  } catch {
    authenticated = false;
  }

  let completion: Awaited<
    ReturnType<typeof completeLoginAttempt>
  >;

  try {
    completion = await completeLoginAttempt(
      reservation.reservation_id,
      authenticated,
    );
  } catch {
    if (authenticated) {
      try {
        await client.auth.signOut({ scope: "local" });
      } catch {
        // Login remains denied even when cleanup fails.
      }
    }

    throw new LoginSecurityUnavailableError();
  }

  if (
    !completion.accepted ||
    completion.is_locked ||
    !authenticated
  ) {
    if (authenticated) {
      try {
        await client.auth.signOut({ scope: "local" });
      } catch {
        // Login remains denied even when cleanup fails.
      }
    }

    return false;
  }

  return true;
}