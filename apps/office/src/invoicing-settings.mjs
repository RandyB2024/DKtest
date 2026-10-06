import {
  OfficeError,
  checkQuery,
} from './auth/supabase.mjs';


const uuid =
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;


const writableRoles =
  new Set([
    'owner',
    'admin',
    'accountant',
    'handler',
  ]);


function invalid(
  message =
    'Controleer de factuurinstellingen.',
) {
  return new OfficeError(
    400,
    'INVALID_INVOICE_SETTINGS',
    message,
  );
}


function textValue(
  value,
  max = 500,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (
    typeof value !== 'string'
  ) {
    throw invalid();
  }

  const result =
    value.trim();

  if (
    result.length >
    max
  ) {
    throw invalid();
  }

  return result;
}


export async function
invoicingSettingsRoute(
  req,
  url,
  client,
  user,
  readBody,
) {
  const match =
    url.pathname.match(
      /^\/api\/organizations\/([^/]+)\/invoicing-settings$/,
    );

  if (!match) {
    return null;
  }


  const organizationId =
    decodeURIComponent(
      match[1],
    );


  if (
    !uuid.test(
      organizationId,
    )
  ) {
    throw invalid(
      'Ongeldige onderneming.',
    );
  }


  const organization =
    checkQuery(
      await client
        .from(
          'organizations',
        )
        .select(
          'id,name,legal_name,registration_number,archived_at',
        )
        .eq(
          'id',
          organizationId,
        )
        .is(
          'archived_at',
          null,
        )
        .maybeSingle(),
    );


  if (!organization) {
    throw new OfficeError(
      404,
      'ORGANIZATION_NOT_FOUND',
      'Onderneming niet gevonden.',
    );
  }


  if (
    req.method ===
    'GET'
  ) {
    if (url.search) {
      throw invalid(
        'Ongeldige aanvraag.',
      );
    }


    const profile =
      checkQuery(
        await client.rpc(
          'get_customer_invoice_profile',
          {
            p_organization_id:
              organizationId,
          },
        ),
      );


    return {
      status:
        200,

      data: {
        organization,
        profile,

        canWrite:
          writableRoles.has(
            user.roleCode,
          ),
      },
    };
  }


  if (
    req.method !==
    'PUT'
  ) {
    throw new OfficeError(
      405,
      'METHOD_NOT_ALLOWED',
      'Deze actie is niet toegestaan.',
    );
  }


  if (
    !writableRoles.has(
      user.roleCode,
    )
  ) {
    throw new OfficeError(
      403,
      'WRITE_DENIED',
      'Uw Office-rol heeft alleen leesrechten.',
    );
  }


  if (url.search) {
    throw invalid(
      'Ongeldige aanvraag.',
    );
  }


  const input =
    await readBody(req);


  const allowed =
    new Set([
      'companyName',
      'registrationNumber',
      'vatNumber',
      'phone',
      'website',
      'businessAddress',
      'iban',
      'bic',
      'invoiceEmail',
      'footerText',
      'defaultPaymentTermDays',
      'invoicePrefix',
      'creditPrefix',
    ]);


  if (
    Object.keys(input)
      .some(
        key =>
          !allowed.has(
            key,
          ),
      )
  ) {
    throw invalid();
  }


  if (
    !input.businessAddress ||
    Array.isArray(
      input.businessAddress,
    ) ||
    typeof input.businessAddress !==
      'object'
  ) {
    throw invalid(
      'Bedrijfsadres is ongeldig.',
    );
  }


  const addressKeys =
    new Set([
      'street',
      'houseNumber',
      'addition',
      'postalCode',
      'city',
      'country',
    ]);


  if (
    Object.keys(
      input.businessAddress,
    ).some(
      key =>
        !addressKeys.has(
          key,
        ),
    )
  ) {
    throw invalid(
      'Bedrijfsadres bevat ongeldige velden.',
    );
  }


  const paymentTerm =
    Number(
      input.defaultPaymentTermDays,
    );


  if (
    !Number.isInteger(
      paymentTerm,
    ) ||
    paymentTerm < 1 ||
    paymentTerm > 365
  ) {
    throw invalid(
      'Betaaltermijn is ongeldig.',
    );
  }


  const profile =
    checkQuery(
      await client.rpc(
        'office_update_invoice_profile',
        {
          p_organization_id:
            organizationId,

          p_company_name:
            textValue(
              input.companyName,
              200,
            ),

          p_registration_number:
            textValue(
              input.registrationNumber,
              40,
            ),

          p_vat_number:
            textValue(
              input.vatNumber,
              40,
            ),

          p_phone:
            textValue(
              input.phone,
              40,
            ),

          p_website:
            textValue(
              input.website,
              200,
            ),

          p_business_address: {
            street:
              textValue(
                input.businessAddress.street,
                120,
              ),

            houseNumber:
              textValue(
                input.businessAddress.houseNumber,
                20,
              ),

            addition:
              textValue(
                input.businessAddress.addition,
                20,
              ),

            postalCode:
              textValue(
                input.businessAddress.postalCode,
                20,
              ),

            city:
              textValue(
                input.businessAddress.city,
                100,
              ),

            country:
              textValue(
                input.businessAddress.country,
                80,
              ),
          },

          p_iban:
            textValue(
              input.iban,
              40,
            ),

          p_bic:
            textValue(
              input.bic,
              20,
            ),

          p_invoice_email:
            textValue(
              input.invoiceEmail,
              254,
            ),

          p_footer_text:
            textValue(
              input.footerText,
              500,
            ),

          p_default_payment_term_days:
            paymentTerm,

          p_invoice_prefix:
            textValue(
              input.invoicePrefix,
              10,
            ),

          p_credit_prefix:
            textValue(
              input.creditPrefix,
              10,
            ),
        },
      ),
    );


  return {
    status:
      200,

    data: {
      organization,
      profile,

      canWrite:
        true,
    },
  };
}
