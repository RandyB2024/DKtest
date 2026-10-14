import {
  checkQuery,
  OfficeError,
} from './auth/supabase.mjs';


const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function requireUuid(
  value,
  label
) {
  if (
    typeof value !== 'string'
    || !uuid.test(value)
  ) {
    throw new OfficeError(
      400,
      'INVALID_ID',
      `${label} is ongeldig.`
    );
  }

  return value;
}


function requireDate(
  value,
  label,
  optional = false
) {
  if (
    optional
    && (
      value === null
      || value === undefined
      || value === ''
    )
  ) {
    return null;
  }

  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new OfficeError(
      400,
      'INVALID_DATE',
      `${label} is ongeldig.`
    );
  }

  return value;
}


export async function taxReturnsRoute(
  req,
  url,
  client,
  user,
  readBody
) {
  if (
    url.pathname !==
      '/api/tax-returns'
  ) {
    return null;
  }


  if (req.method === 'GET') {
    const organizationId =
      requireUuid(
        url.searchParams.get(
          'organizationId'
        ),
        'Onderneming'
      );


    const result =
      checkQuery(
        await client.rpc(
          'office_tax_get_periods',
          {
            p_organization_id:
              organizationId,
          }
        )
      );


    return {
      status: 200,

      data: result,
    };
  }


  if (req.method !== 'POST') {
    throw new OfficeError(
      405,
      'METHOD_NOT_ALLOWED',
      'Actie niet toegestaan.'
    );
  }


  const input =
    await readBody(req);


  if (
    input.action !==
      'upsertPeriod'
  ) {
    throw new OfficeError(
      400,
      'INVALID_ACTION',
      'Ongeldige aangifteactie.'
    );
  }


  const organizationId =
    requireUuid(
      input.organizationId,
      'Onderneming'
    );


  const allowedTaxTypes =
    new Set([
      'vat',
      'icp',
      'oss',
      'payroll',
      'corporate_tax',
      'income_tax',
      'dividend_tax',
    ]);


  const allowedStatuses =
    new Set([
      'draft',
      'prepared',
      'ready',
      'submitted',
      'accepted',
      'rejected',
      'paid',
      'not_applicable',
    ]);


  if (
    !allowedTaxTypes.has(
      input.taxType
    )
  ) {
    throw new OfficeError(
      400,
      'INVALID_TAX_TYPE',
      'Ongeldig aangiftetype.'
    );
  }


  if (
    !allowedStatuses.has(
      input.status
    )
  ) {
    throw new OfficeError(
      400,
      'INVALID_STATUS',
      'Ongeldige aangiftestatus.'
    );
  }


  const periodStart =
    requireDate(
      input.periodStart,
      'Begindatum'
    );

  const periodEnd =
    requireDate(
      input.periodEnd,
      'Einddatum'
    );

  const dueDate =
    requireDate(
      input.dueDate,
      'Aangiftedeadline'
    );

  const paymentDueDate =
    requireDate(
      input.paymentDueDate,
      'Betaaldeadline',
      true
    );


  if (
    periodEnd <
      periodStart
  ) {
    throw new OfficeError(
      400,
      'INVALID_PERIOD',
      'De einddatum ligt voor de begindatum.'
    );
  }


  const reference =
    typeof input.reference ===
      'string'
      ? input.reference
          .trim()
          .slice(0, 200)
      : null;


  const result =
    checkQuery(
      await client.rpc(
        'office_tax_upsert_period',
        {
          p_organization_id:
            organizationId,

          p_tax_type:
            input.taxType,

          p_period_start:
            periodStart,

          p_period_end:
            periodEnd,

          p_due_date:
            dueDate,

          p_payment_due_date:
            paymentDueDate,

          p_status:
            input.status,

          p_reference:
            reference || null,

          p_source:
            'manual',
        }
      )
    );


  return {
    status: 200,

    data: result,
  };
}
