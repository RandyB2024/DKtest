import {
  OfficeError,
  checkQuery,
} from './auth/supabase.mjs';

const uuid =
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function paymentMonitoringRoute(
  req,
  url,
  client,
) {
  if (
    req.method !== 'GET'
    || url.pathname !== '/api/payment-monitoring'
  ) {
    return null;
  }

  const organizationValues =
    url.searchParams.getAll(
      'organizationId'
    );

  if (
    organizationValues.length > 1
  ) {
    throw new OfficeError(
      400,
      'INVALID_ORGANIZATION',
      'Kies maximaal één onderneming.'
    );
  }

  const organizationId =
    organizationValues[0] || null;

  if (
    organizationId
    && !uuid.test(
      organizationId
    )
  ) {
    throw new OfficeError(
      400,
      'INVALID_ORGANIZATION',
      'Ongeldige onderneming.'
    );
  }

  const limitValue =
    url.searchParams.get(
      'limit'
    );

  const limit =
    limitValue === null
      ? 250
      : Number(limitValue);

  if (
    !Number.isInteger(limit)
    || limit < 1
    || limit > 500
  ) {
    throw new OfficeError(
      400,
      'INVALID_LIMIT',
      'Ongeldige limiet.'
    );
  }

  const data =
    checkQuery(
      await client.rpc(
        'office_get_payment_monitoring',
        {
          p_organization_id:
            organizationId,
          p_limit:
            limit,
        }
      )
    );

  return {
    status: 200,
    data,
  };
}
