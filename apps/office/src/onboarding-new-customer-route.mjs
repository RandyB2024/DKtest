import {createClient} from '@supabase/supabase-js';
import {startWorkflow} from './prospect-workflow-v4.mjs';
import { OfficeError } from './auth/supabase.mjs';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid() {
  return new OfficeError(
    400,
    'INVALID_ONBOARDING_INPUT',
    'Controleer de klantnaam, ondernemingsnaam en het e-mailadres.'
  );
}

export async function onboardingNewCustomerRoute(
  req,
  url,
  client,
  user,
  readBody,
  config,
  fetchImpl
) {
  if (
    url.pathname !== '/api/onboarding/new-customer' ||
    req.method !== 'POST'
  ) {
    return null;
  }

  if (url.search) {
    throw invalid();
  }

  if (!user.canManageCustomers || !user.aal2) {
    throw new OfficeError(
      403,
      'ONBOARDING_DENIED',
      'Geen toestemming om klantaanvragen aan te maken.'
    );
  }

  const input = await readBody(req);

  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      key => !['customerName', 'companyName', 'email'].includes(key)
    )
  ) {
    throw invalid();
  }

  if (
    typeof input.customerName !== 'string' ||
    typeof input.companyName !== 'string' ||
    typeof input.email !== 'string'
  ) {
    throw invalid();
  }

  const customerName = input.customerName.trim();
  const companyName = input.companyName.trim();
  const email = input.email.trim().toLowerCase();

  if (
    !customerName ||
    customerName.length > 200 ||
    !companyName ||
    companyName.length > 200 ||
    !email ||
    email.length > 254 ||
    !emailPattern.test(email)
  ) {
    throw invalid();
  }

  const { data, error } = await client.rpc(
    'office_create_onboarding_new_customer',
    {
      p_customer_name: customerName,
      p_company_name: companyName,
      p_email: email
    }
  );

  if (error) {
    if (error.code === '23505') {
      throw new OfficeError(
        409,
        'ONBOARDING_EXISTS',
        'Er bestaat al een lopende aanvraag voor dit e-mailadres.'
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
      throw invalid();
    }

    throw new OfficeError(
      503,
      'ONBOARDING_UNAVAILABLE',
      'De klantaanvraag kon niet worden opgeslagen.'
    );
  }

  if (
    !data ||
    typeof data.relationship_id !== 'string' ||
    typeof data.application_id !== 'string'
  ) {
    throw new OfficeError(
      503,
      'ONBOARDING_UNAVAILABLE',
      'De database gaf geen geldige bevestiging.'
    );
  }

  // Create Workflow 4.0 without sending a public onboarding invitation.
  // Older applications never receive an implicit migration.
  if (!config?.supabaseUrl || !config?.supabaseServiceRoleKey) {
    throw new OfficeError(503,'WORKFLOW_CONFIG','Klanttraject kan nog niet worden voorbereid.');
  }
  const supa=createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetchImpl}
  });
  const original=await supa.from('office_onboarding_applications').select('id,applicant_data,status')
    .eq('id',data.application_id).maybeSingle();
  if(original.error||!original.data||original.data.status!=='draft') {
    throw new OfficeError(503,'WORKFLOW_UNAVAILABLE','De conceptaanvraag is aangemaakt maar het klanttraject kon niet worden gestart.');
  }
  const applicant=original.data.applicant_data||{};
  const updated=await supa.from('office_onboarding_applications')
    .update({applicant_data:{...applicant,workflowV4:startWorkflow(user.id)}})
    .eq('id',data.application_id).eq('status','draft').select('id').maybeSingle();
  if(updated.error||!updated.data) {
    throw new OfficeError(503,'WORKFLOW_UNAVAILABLE','De conceptaanvraag is aangemaakt maar het klanttraject kon niet worden opgeslagen.');
  }
  return {
    status: 201,
    data: {
      relationshipId: data.relationship_id,
      applicationId: data.application_id,
      status: data.status,
      emailSent: false
    }
  };
}