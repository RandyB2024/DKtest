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
      creditors,
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

        client
          .from('creditors')
          .select(
            'id,organization_id,name,iban,archived_at'
          )
          .eq(
            'organization_id',
            organizationId
          )
          .is(
            'archived_at',
            null
          )
          .order(
            'name',
            {
              ascending: true,
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

    if (creditors.error) {
      throw new OfficeError(
        503,
        'CREDITORS_UNAVAILABLE',
        'Crediteuren kunnen niet worden geladen.'
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

        creditors:
          creditors.data ?? [],

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
    && path === '/api/banking/process-purchase-document'
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

    const requestId =
      input.requestId;

    const creditorId =
      input.creditorId;

    await requireOrganization(
      client,
      organizationId
    );

    if (
      !uuid.test(requestId ?? '')
      || !uuid.test(creditorId ?? '')
    ) {
      throw new OfficeError(
        400,
        'INVALID_PURCHASE_DOCUMENT',
        'Ongeldig factuurverzoek of crediteur.'
      );
    }

    const invoiceNumber =
      typeof input.invoiceNumber === 'string'
        ? input.invoiceNumber.trim()
        : '';

    const invoiceDate =
      input.invoiceDate;

    const dueDate =
      input.dueDate;

    const subtotalCents =
      Number(input.subtotalCents);

    const vatCents =
      Number(input.vatCents);

    const description =
      typeof input.description === 'string'
        ? input.description.trim()
        : '';

    if (
      !invoiceNumber
      || !/^\d{4}-\d{2}-\d{2}$/.test(
        invoiceDate ?? ''
      )
      || !/^\d{4}-\d{2}-\d{2}$/.test(
        dueDate ?? ''
      )
      || !Number.isInteger(subtotalCents)
      || subtotalCents < 0
      || !Number.isInteger(vatCents)
      || vatCents < 0
    ) {
      throw new OfficeError(
        400,
        'INVALID_PURCHASE_DOCUMENT',
        'Controleer factuurnummer, datums en bedragen.'
      );
    }

    const {
      data:
        invoice,
      error:
        invoiceError,
    } =
      await client.rpc(
        'office_create_purchase_invoice_from_bank_document',
        {
          p_organization_id:
            organizationId,

          p_request_id:
            requestId,

          p_creditor_id:
            creditorId,

          p_invoice_number:
            invoiceNumber,

          p_invoice_date:
            invoiceDate,

          p_due_date:
            dueDate,

          p_subtotal_cents:
            subtotalCents,

          p_vat_cents:
            vatCents,

          p_description:
            description || null,
        }
      );

    if (invoiceError) {
      if (
        invoiceError.code === '23505'
      ) {
        throw new OfficeError(
          409,
          'PURCHASE_INVOICE_EXISTS',
          'Deze inkoopfactuur bestaat al.'
        );
      }

      if (
        invoiceError.code === '42501'
      ) {
        throw new OfficeError(
          403,
          'PURCHASE_INVOICE_DENIED',
          'U bent niet bevoegd om deze inkoopfactuur te verwerken.'
        );
      }

      if (
        invoiceError.code === '22023'
        || invoiceError.code === 'P0002'
      ) {
        throw new OfficeError(
          400,
          'PURCHASE_INVOICE_INVALID',
          invoiceError.message
          || 'De inkoopfactuur kan niet worden verwerkt.'
        );
      }

      throw new OfficeError(
        503,
        'PURCHASE_INVOICE_FAILED',
        'De inkoopfactuur kon niet worden aangemaakt.'
      );
    }

    const transaction =
      checkQuery(
        await client
          .from(
            'bank_transactions'
          )
          .select(
            'id,amount_cents,reconciliation_status,payment_id'
          )
          .eq(
            'id',
            invoice.transactionId
          )
          .eq(
            'organization_id',
            organizationId
          )
          .maybeSingle()
      );

    let matched = false;
    let matchResult = null;

    if (
      transaction
      && transaction.reconciliation_status !==
        'matched'
      && !transaction.payment_id
      && Math.abs(
        Number(
          transaction.amount_cents
        )
      ) ===
        Number(
          invoice.totalCents
        )
    ) {
      const confirmed =
        await client.rpc(
          'confirm_bank_match',
          {
            p_organization_id:
              organizationId,

            p_transaction_id:
              invoice.transactionId,

            p_invoice_id:
              invoice.invoiceId,

            p_invoice_type:
              'purchase',
          }
        );

      if (!confirmed.error) {
        matched = true;
        matchResult =
          confirmed.data;
      }
    }

    if (!matched) {
      await client.rpc(
        'auto_match_bank_transactions',
        {
          p_organization_id:
            organizationId,
        }
      );
    }

    return {
      status: 200,
      data: {
        invoice,
        matched,
        match:
          matchResult,
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
