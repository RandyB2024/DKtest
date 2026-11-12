import { OfficeError } from './auth/supabase.mjs';

export async function onboardingListRoute(req, url, client, user) {
  if (url.pathname !== '/api/onboarding/applications' || req.method !== 'GET') {
    return null;
  }

  if (url.search) {
    throw new OfficeError(400, 'INVALID_REQUEST', 'Ongeldige aanvraag.');
  }

  if (!user.canManageCustomers || !user.aal2) {
    throw new OfficeError(
      403,
      'ONBOARDING_DENIED',
      'Geen toestemming om klantaanvragen te bekijken.'
    );
  }

  const { data, error } = await client.rpc(
    'office_list_onboarding_applications'
  );

  if (error) {
    if (error.code === '42501') {
      throw new OfficeError(
        403,
        'ONBOARDING_DENIED',
        'Geen toestemming om klantaanvragen te bekijken.'
      );
    }
    throw new OfficeError(
      503,
      'ONBOARDING_UNAVAILABLE',
      'Het overzicht met klantaanvragen is tijdelijk niet beschikbaar.'
    );
  }

  if (!Array.isArray(data)) {
    throw new OfficeError(
      503,
      'ONBOARDING_UNAVAILABLE',
      'Het overzicht met klantaanvragen gaf een ongeldig resultaat.'
    );
  }

  return { status: 200, data: { applications: data } };
}
