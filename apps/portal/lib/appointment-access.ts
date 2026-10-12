import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  AccessError,
  requireAal2,
  requirePortalIdentity,
} from "./portal-access";

import {
  requirePersonalIdentity,
} from "./personal-access";


export type AppointmentIdentity = {
  userId: string;
  displayName: string;
  email: string;

  personalAccess: boolean;
  businessAccess: boolean;
};


export async function requireAppointmentIdentity(
  client: SupabaseClient,
): Promise<AppointmentIdentity> {

  /*
   * Eerst Mijn Bestemming proberen.
   *
   * Alleen een echte 403 wegens ontbrekende
   * persoonlijke toegang mag doorvallen naar
   * Mijn Onderneming.
   *
   * 401 / 503 enzovoort blijven fail-closed.
   */
  try {
    const personal =
      await requirePersonalIdentity(
        client,
      );


    if (!personal.aal2) {
      throw new AccessError(
        403,
        "Bevestig eerst jouw identiteit met tweestapsverificatie.",
        "MFA_REQUIRED",
      );
    }


    return {
      userId:
        personal.profile.id,

      displayName:
        personal.profile.display_name,

      email:
        personal.profile.email,

      personalAccess:
        true,

      businessAccess:
        false,
    };

  } catch (error) {

    if (
      !(error instanceof AccessError) ||
      error.status !== 403 ||
      error.code === "MFA_REQUIRED"
    ) {
      throw error;
    }
  }


  /*
   * Geen persoonlijke toegang:
   * controleer dan Mijn Onderneming.
   */
  const business =
    await requirePortalIdentity(
      client,
    );


  requireAal2(
    business,
  );


  return {
    userId:
      business.profile.id,

    displayName:
      business.profile.display_name,

    email:
      business.profile.email,

    personalAccess:
      false,

    businessAccess:
      true,
  };
}
