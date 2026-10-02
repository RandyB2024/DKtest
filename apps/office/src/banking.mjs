import { sendMissingInvoiceEmail } from './emailjs.mjs';
import {
  OfficeError,
  checkQuery,
} from './auth/supabase.mjs';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const writableRoles =
  new Set([
    'owner',
    'admin',
    'accountant',
    'handler',
  ]);

async function requireOrganization(
  client,
  organizationId,
) {
  if (!uuid.test(organizationId ?? '')) {
    throw new OfficeError(
      400,
      'INVALID_ORGANIZATION',
      'Kies een geldige onderneming.'
    );
  }

  const organization =
    checkQuery(
      await client
        .from('organizations')
        .select('id,name,archived_at')
        .eq('id', organizationId)
        .is('archived_at', null)
        .maybeSingle()
    );

  if (!organization) {
    throw new OfficeError(
      404,
      'ORGANIZATION_NOT_FOUND',
      'Onderneming niet gevonden.'
    );
  }

  return organization;
}

export async function bankingRoute(
  req,
  url,
  client,
  user,
  readBody,
  config,
  fetchImpl,
) {
  const path = url.pathname;

  if (
    req.method === 'GET'
    && path === '/api/banking'
  ) {
    const values =
      url.searchParams.getAll(
        'organizationId'
      );

    if (values.length !== 1) {
      throw new OfficeError(
        400,
        'ORGANIZATION_REQUIRED',
        'Kies ??n onderneming.'
      );
    }

    const organizationId =
      values[0];

    const organization =
      await requireOrganization(
        client,
        organizationId
      );

    const [
      accounts,
      transactions,
      suggestions,
      documentRequests,
    ] =
      await Promise.all([
        client.rpc(
          'get_bank_accounts',
          {
            p_organization_id:
              organizationId,
          }
        ),

        client.rpc(
          'get_bank_transactions',
          {
            p_organization_id:
              organizationId,
            p_limit:
              100,
          }
        ),

        client.rpc(
          'get_bank_match_suggestions',
          {
            p_organization_id:
              organizationId,
            p_limit:
              100,
          }
        ),

        client
          .from(
            'bank_document_requests'
          )
          .select(
            [
              'id',
              'organization_id',
              'bank_transaction_id',
              'recipient_email',
              'counterparty_name',
              'amount_cents',
              'transaction_date',
              'status',
              'requested_at',
              'email_sent_at',
              'document_id',
              'received_at',
            ].join(',')
          )
          .eq(
            'organization_id',
            organizationId
          )
          .in(
            'status',
            [
              'requested',
              'received',
            ]
          )
          .order(
            'requested_at',
            {
              ascending:
                false,
            }
          ),
      ]);

    if (accounts.error) {
      throw new OfficeError(
        503,
        'BANK_ACCOUNTS_UNAVAILABLE',
        'Bankrekeningen kunnen niet worden geladen.'
      );
    }

    if (transactions.error) {
      throw new OfficeError(
        503,
        'BANK_TRANSACTIONS_UNAVAILABLE',
        'Bankmutaties kunnen niet worden geladen.'
      );
    }

    if (suggestions.error) {
      throw new OfficeError(
        503,
        'BANK_MATCHING_UNAVAILABLE',
        'Matchvoorstellen kunnen niet worden geladen.'
      );
    }

    if (documentRequests.error) {
      throw new OfficeError(
        503,
        'BANK_DOCUMENT_REQUESTS_UNAVAILABLE',
        'Factuurverzoeken kunnen niet worden geladen.'
      );
    }

    return {
      status: 200,
      data: {
        organization,
        accounts:
          accounts.data ?? [],
        transactions:
          transactions.data ?? {
            summary: {},
            items: [],
          },
        suggestions:
          suggestions.data ?? [],

        documentRequests:
          documentRequests.data ?? [],

        canConfirm:
          writableRoles.has(
            user?.roleCode
          ),
      },
    };
  }

  if (
    req.method === 'POST'
    && path === '/api/banking/auto-match'
  ) {
    if (
      !writableRoles.has(
        user?.roleCode
      )
    ) {
      throw new OfficeError(
        403,
        'BANK_WRITE_DENIED',
        'Uw Office-rol heeft alleen leesrechten.'
      );
    }

    const input =
      await readBody(req);

    const organizationId =
      input.organizationId;

    await requireOrganization(
      client,
      organizationId
    );

    const {
      data,
      error,
    } =
      await client.rpc(
        'auto_match_bank_transactions',
        {
          p_organization_id:
            organizationId,
        }
      );

    if (error) {
      if (
        error.code === '42501'
      ) {
        throw new OfficeError(
          403,
          'BANK_AUTO_MATCH_DENIED',
          'U bent niet bevoegd om automatische bankmatches uit te voeren.'
        );
      }

      if (
        error.code === 'P0002'
      ) {
        throw new OfficeError(
          404,
          'BANK_AUTO_MATCH_ORGANIZATION_NOT_FOUND',
          'Onderneming niet gevonden.'
        );
      }

      throw new OfficeError(
        503,
        'BANK_AUTO_MATCH_FAILED',
        'Automatische bankmatching kon niet worden uitgevoerd.'
      );
    }

    return {
      status: 200,
      data:
        data ?? {
          matched: 0,
          skipped: 0,
          failed: 0,
          items: [],
        },
    };
  }


  if (
    req.method === 'POST'
    && path === '/api/banking/request-invoice'
  ) {
    if (
      !writableRoles.has(
        user?.roleCode
      )
    ) {
      throw new OfficeError(
        403,
        'BANK_WRITE_DENIED',
        'Uw Office-rol heeft alleen leesrechten.'
      );
    }

    const input =
      await readBody(req);

    const organizationId =
      input.organizationId;

    const transactionId =
      input.transactionId;

    const organization =
      await requireOrganization(
        client,
        organizationId
      );

    if (
      !uuid.test(transactionId ?? '')
    ) {
      throw new OfficeError(
        400,
        'INVALID_BANK_TRANSACTION',
        'Ongeldige bankmutatie.'
      );
    }

    const {
      data:
        requestData,
      error:
        requestError,
    } =
      await client.rpc(
        'office_create_bank_document_request',
        {
          p_organization_id:
            organizationId,
          p_bank_transaction_id:
            transactionId,
        }
      );

    if (requestError) {
      if (
        requestError.code === '23505'
        || requestError.message?.includes(
          'al een factuurverzoek'
        )
      ) {
        throw new OfficeError(
          409,
          'BANK_DOCUMENT_REQUEST_EXISTS',
          'Voor deze bankmutatie staat al een factuurverzoek open.'
        );
      }

      if (
        requestError.code === '42501'
      ) {
        throw new OfficeError(
          403,
          'BANK_DOCUMENT_REQUEST_DENIED',
          'U bent niet bevoegd om een factuur op te vragen.'
        );
      }

      if (
        requestError.code === 'P0002'
      ) {
        throw new OfficeError(
          404,
          'BANK_DOCUMENT_REQUEST_UNAVAILABLE',
          requestError.message
          || 'Klant of bankmutatie niet beschikbaar.'
        );
      }

      if (
        requestError.code === '22023'
      ) {
        throw new OfficeError(
          400,
          'BANK_DOCUMENT_REQUEST_INVALID',
          requestError.message
          || 'Deze bankmutatie kan niet worden gebruikt voor een factuurverzoek.'
        );
      }

      throw new OfficeError(
        503,
        'BANK_DOCUMENT_REQUEST_FAILED',
        `Het factuurverzoek kon niet worden aangemaakt. ${
          requestError.message || requestError.code || 'Onbekende databasefout.'
        }`
      );
    }

    let mail;

    try {
      mail =
        await sendMissingInvoiceEmail({
          config,
          fetchImpl,
          request:
            requestData,
          organizationName:
            organization.name,
        });

      const sent =
        await client.rpc(
          'office_mark_bank_document_request_sent',
          {
            p_request_id:
              requestData.requestId,
          }
        );

      if (sent.error) {
        throw new OfficeError(
          503,
          'BANK_DOCUMENT_REQUEST_STATUS_FAILED',
          'De e-mail is verzonden, maar de verzendstatus kon niet worden opgeslagen.'
        );
      }
    } catch (error) {
      await client.rpc(
        'office_cancel_bank_document_request',
        {
          p_request_id:
            requestData.requestId,
        }
      );

      throw error;
    }

    return {
      status: 200,
      data: {
        ...requestData,
        email:
          mail,
      },
    };
  }


  if (
    req.method === 'POST'
    && path === '/api/banking/confirm'
  ) {
    if (
      !writableRoles.has(
        user?.roleCode
      )
    ) {
      throw new OfficeError(
        403,
        'BANK_WRITE_DENIED',
        'Uw Office-rol heeft alleen leesrechten.'
      );
    }

    const input =
      await readBody(req);

    const organizationId =
      input.organizationId;

    const transactionId =
      input.transactionId;

    const invoiceId =
      input.invoiceId;

    const invoiceType =
      input.invoiceType;

    await requireOrganization(
      client,
      organizationId
    );

    if (
      !uuid.test(transactionId ?? '')
      || !uuid.test(invoiceId ?? '')
    ) {
      throw new OfficeError(
        400,
        'INVALID_BANK_MATCH',
        'Ongeldige bankmatch.'
      );
    }

    if (
      invoiceType !== 'sales'
      && invoiceType !== 'purchase'
    ) {
      throw new OfficeError(
        400,
        'INVALID_INVOICE_TYPE',
        'Ongeldig factuurtype.'
      );
    }

    const {
      data,
      error,
    } =
      await client.rpc(
        'confirm_bank_match',
        {
          p_organization_id:
            organizationId,
          p_transaction_id:
            transactionId,
          p_invoice_id:
            invoiceId,
          p_invoice_type:
            invoiceType,
        }
      );

    if (error) {
      if (
        error.code === '42501'
        || error.message?.includes(
          'Office-gebruiker'
        )
      ) {
        throw new OfficeError(
          403,
          'BANK_WRITE_DENIED',
          'U bent niet bevoegd om deze bankmatch te bevestigen.'
        );
      }

      if (
        error.message?.includes(
          'al gekoppeld'
        )
        || error.message?.includes(
          'openstaand'
        )
        || error.message?.includes(
          'groter dan'
        )
      ) {
        throw new OfficeError(
          409,
          'BANK_MATCH_CONFLICT',
          'De bankmutatie of factuur is inmiddels gewijzigd. Vernieuw het overzicht.'
        );
      }

      throw new OfficeError(
        503,
        'BANK_MATCH_FAILED',
        'De bankmatch kon niet worden verwerkt.'
      );
    }

    return {
      status: 200,
      data,
    };
  }

  return null;
}
