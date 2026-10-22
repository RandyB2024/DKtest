import { OfficeError } from './auth/supabase.mjs';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateDraft(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new OfficeError(
      400,
      'INVALID_ONBOARDING_INPUT',
      'Controleer de aanvraaggegevens.'
    );
  }

  const allowed = [
    'relationshipId',
    'customerName',
    'companyName',
    'email'
  ];

  if (Object.keys(input).some(key => !allowed.includes(key))) {
    throw new OfficeError(
      400,
      'INVALID_ONBOARDING_INPUT',
      'Onbekende aanvraaggegevens.'
    );
  }

  const {
    relationshipId,
    customerName,
    companyName,
    email
  } = input;

  if (
    typeof relationshipId !== 'string' ||
    !uuidPattern.test(relationshipId) ||
    typeof customerName !== 'string' ||
    typeof companyName !== 'string' ||
    typeof email !== 'string'
  ) {
    throw new OfficeError(
      400,
      'INVALID_ONBOARDING_INPUT',
      'Vul alle verplichte velden correct in.'
    );
  }

  const name = customerName.trim();
  const company = companyName.trim();
  const address = email.trim().toLowerCase();

  if (
    !name ||
    name.length > 200 ||
    !company ||
    company.length > 200 ||
    address.length > 254 ||
    !emailPattern.test(address)
  ) {
    throw new OfficeError(
      400,
      'INVALID_ONBOARDING_INPUT',
      'Controleer de naam, onderneming en het e-mailadres.'
    );
  }

  return {
    p_relationship_id: relationshipId,
    p_customer_name: name,
    p_company_name: company,
    p_email: address
  };
}

export async function onboardingDraftRoute(
  req,
  url,
  client,
  user,
  readBody
) {
  if (
    url.pathname !== '/api/onboarding/drafts' ||
    req.method !== 'POST'
  ) {
    return null;
  }

  if (url.search) {
    throw new OfficeError(
      400,
      'INVALID_REQUEST',
      'Ongeldige aanvraag.'
    );
  }

  if (!user.canManageCustomers || !user.aal2) {
    throw new OfficeError(
      403,
      'ONBOARDING_DENIED',
      'Geen toestemming om klanten uit te nodigen.'
    );
  }

  const input = validateDraft(await readBody(req));

  const { data, error } = await client.rpc(
    'office_create_onboarding_draft',
    input
  );

  if (error) {
    if (error.code === '23505') {
      throw new OfficeError(
        409,
        'ONBOARDING_EXISTS',
        'Voor deze klantrelatie bestaat al een lopende aanvraag.'
      );
    }

    if (error.code === 'P0002') {
      throw new OfficeError(
        404,
        'RELATIONSHIP_NOT_FOUND',
        'Deze klantrelatie bestaat niet of is gearchiveerd.'
      );
    }

    if (error.code === '42501') {
      throw new OfficeError(
        403,
        'ONBOARDING_DENIED',
        'Geen toestemming om deze aanvraag aan te maken.'
      );
    }

    if (['22023', '22P02'].includes(error.code)) {
      throw new OfficeError(
        400,
        'INVALID_ONBOARDING_INPUT',
        'Controleer de ingevulde gegevens.'
      );
    }

    throw new OfficeError(
      503,
      'ONBOARDING_UNAVAILABLE',
      'De aanvraag kon niet worden opgeslagen.'
    );
  }

  return {
    status: 201,
    data: {
      applicationId: data.application_id,
      status: data.status,
      emailSent: false
    }
  };
}