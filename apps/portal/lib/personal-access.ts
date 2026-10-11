import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  validatedTotp,
} from "./supabase/trusted-mfa";

import {
  AccessError,
} from "./portal-access";


export type PersonalProfile = {
  id: string;
  email: string;
  display_name: string;
  account_status: string;
};


export type PersonalIdentity = {
  profile: PersonalProfile;
  aal2: boolean;
};


export async function requirePersonalIdentity(
  client: SupabaseClient,
): Promise<PersonalIdentity> {
  const {
    data: auth,
    error: authError,
  } =
    await client.auth.getUser();


  if (
    authError ||
    !auth.user
  ) {
    throw new AccessError(
      401,
      "Log opnieuw in.",
    );
  }


  if (
    auth.user.deleted_at ||
    auth.user.is_anonymous ||
    (
      auth.user.banned_until &&
      Date.parse(
        auth.user.banned_until,
      ) > Date.now()
    )
  ) {
    throw new AccessError(
      403,
      "Geen toegang tot Mijn Bestemming.",
    );
  }


  const {
    data: profile,
    error: profileError,
  } =
    await client
      .from("profiles")
      .select(
        "id,email,display_name,account_status",
      )
      .eq(
        "id",
        auth.user.id,
      )
      .maybeSingle();


  if (profileError) {
    throw new AccessError(
      503,
      "Uw persoonlijke toegang kan tijdelijk niet worden gecontroleerd.",
    );
  }


  if (
    !profile ||
    profile.account_status !==
      "active"
  ) {
    throw new AccessError(
      403,
      "Geen toegang tot Mijn Bestemming.",
    );
  }


  /*
   * Cruciale scheiding:
   *
   * organization_memberships geeft GEEN recht
   * op Mijn Bestemming.
   *
   * Alleen een expliciet persoonlijk
   * toegangsrecord geeft toegang.
   */
  const {
    data: personalAccess,
    error: personalAccessError,
  } =
    await client
      .from(
        "personal_portal_access",
      )
      .select(
        "user_id,status",
      )
      .eq(
        "user_id",
        auth.user.id,
      )
      .eq(
        "status",
        "active",
      )
      .maybeSingle();


  if (personalAccessError) {
    throw new AccessError(
      503,
      "Uw persoonlijke toegang kan tijdelijk niet worden gecontroleerd.",
    );
  }


  if (!personalAccess) {
    throw new AccessError(
      403,
      "Dit account heeft geen toegang tot Mijn Bestemming.",
    );
  }


  const aal2 =
    await validatedTotp(
      client,
      auth.user.id,
    );


  return {
    profile:
      profile as PersonalProfile,

    aal2,
  };
}
