import {
  createClient,
} from '@supabase/supabase-js';

import {
  PDFDocument,
  StandardFonts,
  rgb,
} from 'pdf-lib';

import {
  OfficeError,
  checkQuery,
} from './auth/supabase.mjs';


const EMAILJS_ENDPOINT =
  'https://api.emailjs.com/api/v1.0/email/send';


const uuid =
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;


const writableRoles =
  new Set([
    'owner',
    'admin',
    'accountant',
    'handler',
  ]);


function email(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}


function validEmail(value) {
  return (
    value.length >= 5
    && value.length <= 254
    && value.includes('@')
  );
}


function euro(cents) {
  return new Intl.NumberFormat(
    'nl-NL',
    {
      style: 'currency',
      currency: 'EUR',
    }
  ).format(
    Number(cents ?? 0) / 100
  );
}


function dateNl(value) {
  return new Intl.DateTimeFormat(
    'nl-NL',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }
  ).format(
    new Date(
      `${value}T12:00:00Z`
    )
  );
}


function safeFilename(value) {
  return String(value)
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      '-'
    )
    .replace(
      /-+/g,
      '-'
    )
    .replace(
      /^[-.]+|[-.]+$/g,
      ''
    ) || 'creditfactuur';
}


function adminClient(config) {
  if (
    !config.supabaseUrl
    || !config.supabaseServiceRoleKey
  ) {
    throw new OfficeError(
      503,
      'CREDIT_CONFIGURATION_REQUIRED',
      'Creditfacturen zijn nog niet volledig geconfigureerd.'
    );
  }

  return createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },

      global: {
        headers: {
          'X-Client-Info':
            'bestemd-office-credit-invoices',
        },
      },
    }
  );
}


function addressLines(address) {
  if (
    !address
    || typeof address !== 'object'
  ) {
    return [];
  }

  const first =
    [
      address.street,
      [
        address.houseNumber,
        address.addition,
      ]
        .filter(Boolean)
        .join(''),
    ]
      .filter(Boolean)
      .join(' ');

  const second =
    [
      address.postalCode,
      address.city,
    ]
      .filter(Boolean)
      .join(' ');

  return [
    first,
    second,
    address.country,
  ].filter(Boolean);
}


function wrap(
  value,
  font,
  size,
  maxWidth,
) {
  const words =
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);

  const lines = [];
  let line = '';

  for (const word of words) {
    const next =
      line
        ? `${line} ${word}`
        : word;

    if (
      font.widthOfTextAtSize(
        next,
        size
      ) <= maxWidth
    ) {
      line = next;
      continue;
    }

    if (line) {
      lines.push(line);
    }

    line = word;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}


async function renderCreditPdf(
  snapshot,
  admin,
) {
  if (
    !snapshot?.invoice
    || !snapshot?.seller
    || !snapshot?.debtor
    || !Array.isArray(
      snapshot.lines
    )
  ) {
    throw new Error(
      'Creditfactuursnapshot is onvolledig.'
    );
  }


  const pdf =
    await PDFDocument.create();

  const regular =
    await pdf.embedFont(
      StandardFonts.Helvetica
    );

  const bold =
    await pdf.embedFont(
      StandardFonts.HelveticaBold
    );

  const width =
    595.28;

  const height =
    841.89;

  const margin =
    46;

  let page =
    pdf.addPage([
      width,
      height,
    ]);

  let y =
    height - margin;


  const draw = (
    value,
    x,
    size = 9,
    strong = false,
  ) => {
    page.drawText(
      String(value ?? ''),
      {
        x,
        y,
        size,
        font:
          strong
            ? bold
            : regular,

        color:
          rgb(
            0.08,
            0.16,
            0.22
          ),
      }
    );
  };


  let logoHeight = 0;

  if (
    snapshot.seller
      .logoStoragePath
  ) {
    try {
      const {
        data,
        error,
      } =
        await admin.storage
          .from(
            'company-assets'
          )
          .download(
            snapshot.seller
              .logoStoragePath
          );

      if (
        !error
        && data
      ) {
        const bytes =
          new Uint8Array(
            await data.arrayBuffer()
          );

        const image =
          data.type ===
            'image/png'
            ? await pdf.embedPng(
                bytes
              )
            : await pdf.embedJpg(
                bytes
              );

        const scaled =
          image.scaleToFit(
            150,
            60
          );

        page.drawImage(
          image,
          {
            x:
              margin,

            y:
              y -
              scaled.height,

            width:
              scaled.width,

            height:
              scaled.height,
          }
        );

        logoHeight =
          scaled.height;
      }
    } catch {
      // Logo mag het document nooit blokkeren.
    }
  }


  const title =
    'CREDITFACTUUR';

  page.drawText(
    title,
    {
      x:
        width -
        margin -
        bold.widthOfTextAtSize(
          title,
          22
        ),

      y:
        y - 3,

      size:
        22,

      font:
        bold,

      color:
        rgb(
          0.03,
          0.24,
          0.32
        ),
    }
  );


  y -=
    Math.max(
      logoHeight,
      48
    ) + 22;


  draw(
    snapshot.seller.companyName,
    margin,
    11,
    true
  );

  y -= 15;


  for (
    const line of
    addressLines(
      snapshot.seller
        .businessAddress
    )
  ) {
    draw(
      line,
      margin,
      8.5
    );

    y -= 12;
  }


  const metaX =
    330;

  let metaY =
    height -
    margin -
    42;


  const metadata = [
    [
      'Creditnummer',
      snapshot.invoice
        .invoiceNumber,
    ],

    [
      'Creditdatum',
      dateNl(
        snapshot.invoice
          .invoiceDate
      ),
    ],

    [
      'Originele factuur',
      snapshot.invoice
        .originalInvoiceNumber
        || 'Zie gekoppelde factuur',
    ],
  ];


  for (
    const [
      label,
      value,
    ] of metadata
  ) {
    page.drawText(
      label,
      {
        x:
          metaX,

        y:
          metaY,

        size:
          8,

        font:
          regular,

        color:
          rgb(
            0.4,
            0.45,
            0.48
          ),
      }
    );

    page.drawText(
      String(value ?? ''),
      {
        x:
          metaX + 94,

        y:
          metaY,

        size:
          8.5,

        font:
          bold,
      }
    );

    metaY -= 14;
  }


  y -= 28;

  draw(
    'CREDIT AAN',
    margin,
    8,
    true
  );

  y -= 16;

  draw(
    snapshot.debtor.name,
    margin,
    10,
    true
  );

  y -= 14;


  for (
    const line of
    addressLines(
      snapshot.debtor.address
    )
  ) {
    draw(
      line,
      margin,
      8.5
    );

    y -= 12;
  }


  if (
    snapshot.invoice
      .creditReason
  ) {
    y -= 12;

    draw(
      'Reden credit:',
      margin,
      8,
      true
    );

    y -= 14;

    for (
      const line of wrap(
        snapshot.invoice
          .creditReason,
        regular,
        8.5,
        width -
        margin * 2
      )
    ) {
      draw(
        line,
        margin,
        8.5
      );

      y -= 11;
    }
  }


  y -= 22;


  page.drawRectangle({
    x:
      margin,

    y:
      y - 5,

    width:
      width -
      margin * 2,

    height:
      24,

    color:
      rgb(
        0.94,
        0.97,
        0.98
      ),
  });


  const columns = {
    description:
      margin,

    quantity:
      320,

    price:
      375,

    vat:
      452,

    total:
      495,
  };


  draw(
    'Omschrijving',
    columns.description,
    8,
    true
  );

  draw(
    'Aantal',
    columns.quantity,
    8,
    true
  );

  draw(
    'Prijs',
    columns.price,
    8,
    true
  );

  draw(
    'Btw',
    columns.vat,
    8,
    true
  );

  draw(
    'Totaal',
    columns.total,
    8,
    true
  );


  y -= 30;


  for (
    const line of
    [...snapshot.lines]
      .sort(
        (a, b) =>
          Number(a.position) -
          Number(b.position)
      )
  ) {
    const descriptions =
      wrap(
        line.description,
        regular,
        8.5,
        250
      );


    if (
      y -
      Math.max(
        24,
        descriptions.length * 11
      ) <
      100
    ) {
      page =
        pdf.addPage([
          width,
          height,
        ]);

      y =
        height -
        margin;
    }


    let descriptionY =
      y;

    for (
      const current of
      descriptions
    ) {
      page.drawText(
        current,
        {
          x:
            columns.description,

          y:
            descriptionY,

          size:
            8.5,

          font:
            regular,
        }
      );

      descriptionY -= 11;
    }


    draw(
      Number(
        line.quantity
      ),
      columns.quantity,
      8.2
    );

    draw(
      euro(
        line.unitPriceCents
      ),
      columns.price,
      8.2
    );

    draw(
      line.vatCode ===
        'exempt'
        ? 'Vrij'
        : `${line.vatRate}%`,
      columns.vat,
      8.2
    );

    draw(
      euro(
        line.totalInclVatCents
      ),
      columns.total,
      8.2,
      true
    );


    y -=
      Math.max(
        24,
        descriptions.length * 11
      );
  }


  y -= 18;

  const totalX =
    365;


  draw(
    'Subtotaal',
    totalX,
    9
  );

  draw(
    euro(
      snapshot.invoice
        .subtotalCents
    ),
    490,
    9,
    true
  );

  y -= 16;


  draw(
    'Btw',
    totalX,
    9
  );

  draw(
    euro(
      snapshot.invoice
        .vatCents
    ),
    490,
    9,
    true
  );

  y -= 19;


  page.drawRectangle({
    x:
      totalX - 8,

    y:
      y - 7,

    width:
      width -
      margin -
      totalX +
      8,

    height:
      27,

    color:
      rgb(
        0.9,
        0.96,
        0.97
      ),
  });


  draw(
    'Creditbedrag',
    totalX,
    11,
    true
  );

  draw(
    euro(
      snapshot.invoice
        .totalCents
    ),
    480,
    11,
    true
  );


  const footer =
    [
      snapshot.seller
        .registrationNumber
        ? `KvK ${snapshot.seller.registrationNumber}`
        : '',

      snapshot.seller
        .vatNumber
        ? `Btw ${snapshot.seller.vatNumber}`
        : '',

      snapshot.seller
        .invoiceEmail ?? '',

      snapshot.seller
        .phone ?? '',
    ]
      .filter(Boolean)
      .join('  •  ');


  for (
    const currentPage of
    pdf.getPages()
  ) {
    if (footer) {
      currentPage.drawText(
        footer,
        {
          x:
            margin,

          y:
            30,

          size:
            6.5,

          font:
            regular,

          color:
            rgb(
              0.45,
              0.48,
              0.5
            ),
        }
      );
    }
  }


  return new Uint8Array(
    await pdf.save()
  );
}


async function ensureCreditPdf({
  admin,
  organizationId,
  invoiceId,
}) {
  const {
    data: invoice,
    error: invoiceError,
  } =
    await admin
      .from(
        'sales_invoices'
      )
      .select(
        'id,organization_id,invoice_number,invoice_kind,document_status,pdf_storage_path'
      )
      .eq(
        'id',
        invoiceId
      )
      .eq(
        'organization_id',
        organizationId
      )
      .maybeSingle();


  if (
    invoiceError
    || !invoice
    || invoice.invoice_kind !==
      'credit'
  ) {
    throw new Error(
      'Creditfactuur kon niet worden geladen.'
    );
  }


  const {
    data: snapshotRow,
    error: snapshotError,
  } =
    await admin
      .from(
        'sales_invoice_snapshots'
      )
      .select(
        'snapshot'
      )
      .eq(
        'invoice_id',
        invoiceId
      )
      .eq(
        'organization_id',
        organizationId
      )
      .maybeSingle();


  if (
    snapshotError
    || !snapshotRow?.snapshot
  ) {
    throw new Error(
      'Immutable creditfactuursnapshot ontbreekt.'
    );
  }


  const snapshot =
    snapshotRow.snapshot;


  const filename =
    `${safeFilename(
      `creditfactuur-${invoice.invoice_number}`
    )}.pdf`;


  let path =
    invoice.pdf_storage_path;


  if (!path) {
    path =
      `${organizationId}/${invoiceId}/${filename}`;


    const bytes =
      await renderCreditPdf(
        snapshot,
        admin
      );


    const {
      error: uploadError,
    } =
      await admin.storage
        .from(
          'invoice-pdfs'
        )
        .upload(
          path,
          bytes,
          {
            contentType:
              'application/pdf',

            cacheControl:
              '31536000',

            upsert:
              false,
          }
        );


    if (uploadError) {
      /*
       * Retry/race:
       * bestaand immutable bestand mag worden hergebruikt.
       */
      const existing =
        await admin.storage
          .from(
            'invoice-pdfs'
          )
          .download(
            path
          );

      if (
        existing.error
        || !existing.data
      ) {
        throw new Error(
          'Creditfactuur-PDF kon niet worden opgeslagen.'
        );
      }
    }


    const {
      error: updateError,
    } =
      await admin
        .from(
          'sales_invoices'
        )
        .update({
          pdf_storage_path:
            path,
        })
        .eq(
          'id',
          invoiceId
        )
        .eq(
          'organization_id',
          organizationId
        )
        .is(
          'pdf_storage_path',
          null
        );


    if (updateError) {
      throw new Error(
        'Creditfactuur-PDF kon niet aan het dossier worden gekoppeld.'
      );
    }
  }


  const {
    data: signed,
    error: signedError,
  } =
    await admin.storage
      .from(
        'invoice-pdfs'
      )
      .createSignedUrl(
        path,
        60 * 60 * 24 * 30,
        {
          download:
            filename,
        }
      );


  if (
    signedError
    || !signed?.signedUrl
  ) {
    throw new Error(
      'Beveiligde downloadlink kon niet worden aangemaakt.'
    );
  }


  return {
    snapshot,
    path,
    filename,

    signedUrl:
      signed.signedUrl,
  };
}


async function sendCreditEmail({
  config,
  fetchImpl,
  prepared,
  recipientEmail,
}) {
  const settings =
    config.creditEmailjs;


  if (
    !settings?.serviceId
    || !settings?.templateId
    || !settings?.publicKey
    || !settings?.privateKey
  ) {
    throw new Error(
      'EmailJS creditfactuurconfiguratie ontbreekt.'
    );
  }


  const snapshot =
    prepared.snapshot;

  const seller =
    snapshot.seller;

  const debtor =
    snapshot.debtor;

  const invoice =
    snapshot.invoice;


  const customerCopyEmail =
    email(
      seller.invoiceEmail
    );


  if (
    !validEmail(
      recipientEmail
    )
  ) {
    throw new Error(
      'Het e-mailadres van de debiteur is ongeldig.'
    );
  }


  if (
    !validEmail(
      customerCopyEmail
    )
  ) {
    throw new Error(
      'Het factuur-e-mailadres van de klant ontbreekt of is ongeldig.'
    );
  }


  const subject =
    `Creditfactuur ${invoice.invoiceNumber} van ${seller.companyName}`;


  let response;

  try {
    response =
      await fetchImpl(
        EMAILJS_ENDPOINT,
        {
          method:
            'POST',

          headers: {
            'content-type':
              'application/json',
          },

          body:
            JSON.stringify({
              service_id:
                settings.serviceId,

              template_id:
                settings.templateId,

              user_id:
                settings.publicKey,

              accessToken:
                settings.privateKey,

              template_params: {
                to_email:
                  recipientEmail,

                to_klant_email:
                  customerCopyEmail,

                reply_to:
                  customerCopyEmail,

                debtor_name:
                  debtor.name,

                company_name:
                  seller.companyName,

                credit_number:
                  invoice.invoiceNumber,

                invoice_number:
                  invoice.invoiceNumber,

                original_invoice_number:
                  invoice.originalInvoiceNumber
                  || '',

                credit_reason:
                  invoice.creditReason
                  || '',

                credit_date:
                  dateNl(
                    invoice.invoiceDate
                  ),

                total_amount:
                  euro(
                    invoice.totalCents
                  ),

                credit_amount:
                  euro(
                    invoice.totalCents
                  ),

                email_subject:
                  subject,

                message:
                  `Hierbij ontvang je creditfactuur ${invoice.invoiceNumber} van ${seller.companyName}.`,

                credit_download_url:
                  prepared.signedUrl,

                invoice_download_url:
                  prepared.signedUrl,

                credit_filename:
                  prepared.filename,

                invoice_filename:
                  prepared.filename,
              },
            }),
        }
      );

  } catch(error) {
    /*
     * Providerresultaat onbekend.
     * Niet als failed registreren.
     */
    throw error;
  }


  if (!response.ok) {
    const details =
      await response
        .text()
        .catch(
          () => ''
        );

    const error =
      new Error(
        `EmailJS HTTP ${response.status}${
          details
            ? `: ${details.slice(0,200)}`
            : ''
        }`
      );

    error.providerRejected =
      true;

    throw error;
  }
}


export async function creditInvoiceRoute(
  req,
  url,
  client,
  user,
  readBody,
  config,
  fetchImpl = fetch,
) {
  if (
    url.pathname !==
      '/api/invoicing/credits'
  ) {
    return null;
  }


  if (
    req.method !==
      'POST'
  ) {
    throw new OfficeError(
      405,
      'METHOD_NOT_ALLOWED',
      'Deze actie is niet toegestaan.'
    );
  }


  if (
    !writableRoles.has(
      user?.roleCode
    )
  ) {
    throw new OfficeError(
      403,
      'CREDIT_WRITE_DENIED',
      'Uw Office-rol mag geen creditfacturen maken.'
    );
  }


  if (url.search) {
    throw new OfficeError(
      400,
      'INVALID_CREDIT_REQUEST',
      'Ongeldige aanvraag.'
    );
  }


  const input =
    await readBody(req);


  const allowed =
    new Set([
      'organizationId',
      'originalInvoiceId',
      'reason',
      'idempotencyKey',
    ]);


  if (
    Object.keys(input)
      .some(
        key =>
          !allowed.has(key)
      )
  ) {
    throw new OfficeError(
      400,
      'INVALID_CREDIT_REQUEST',
      'Ongeldige aanvraag.'
    );
  }


  const organizationId =
    input.organizationId;

  const originalInvoiceId =
    input.originalInvoiceId;

  const idempotencyKey =
    input.idempotencyKey;


  if (
    !uuid.test(
      organizationId ?? ''
    )
    || !uuid.test(
      originalInvoiceId ?? ''
    )
    || !uuid.test(
      idempotencyKey ?? ''
    )
  ) {
    throw new OfficeError(
      400,
      'INVALID_CREDIT_REQUEST',
      'Ongeldige creditfactuuraanvraag.'
    );
  }


  const reason =
    typeof input.reason ===
      'string'
      ? input.reason.trim()
      : '';


  if (
    reason.length < 3
    || reason.length > 500
  ) {
    throw new OfficeError(
      400,
      'INVALID_CREDIT_REASON',
      'Geef een duidelijke reden voor de creditfactuur op.'
    );
  }


  /*
   * Organisatie moet ook via de normale
   * Office-gebruikerssessie leesbaar zijn.
   */
  const organization =
    checkQuery(
      await client
        .from(
          'organizations'
        )
        .select(
          'id,name,archived_at'
        )
        .eq(
          'id',
          organizationId
        )
        .is(
          'archived_at',
          null
        )
        .maybeSingle()
    );


  if (!organization) {
    throw new OfficeError(
      404,
      'ORGANIZATION_NOT_FOUND',
      'Onderneming niet gevonden.'
    );
  }


  /*
   * Eerst controleren of een eerdere poging
   * de creditfactuur al heeft aangemaakt.
   * Daardoor kunnen PDF/e-mail veilig worden hervat.
   */
  let credit =
    checkQuery(
      await client
        .from(
          'sales_invoices'
        )
        .select(
          'id,invoice_number,credit_reason,debtor_id,sent_at'
        )
        .eq(
          'organization_id',
          organizationId
        )
        .eq(
          'original_invoice_id',
          originalInvoiceId
        )
        .eq(
          'invoice_kind',
          'credit'
        )
        .neq(
          'document_status',
          'cancelled'
        )
        .is(
          'archived_at',
          null
        )
        .maybeSingle()
    );


  if (!credit) {
    const {
      data,
      error,
    } =
      await client.rpc(
        'office_create_full_credit_invoice',
        {
          p_organization_id:
            organizationId,

          p_original_invoice_id:
            originalInvoiceId,

          p_reason:
            reason,
        }
      );


    if (
      error
      || !data?.creditInvoiceId
    ) {
      throw new OfficeError(
        409,
        'CREDIT_CREATE_FAILED',
        'De creditfactuur kon niet worden aangemaakt.'
      );
    }


    credit = {
      id:
        data.creditInvoiceId,

      invoice_number:
        data.creditInvoiceNumber,

      credit_reason:
        data.creditReason,

      debtor_id:
        null,

      sent_at:
        null,
    };
  }


  const admin =
    adminClient(
      config
    );


  /*
   * PDF bestaat vóórdat we de provider
   * benaderen.
   */
  let prepared;

  try {
    prepared =
      await ensureCreditPdf({
        admin,
        organizationId,
        invoiceId:
          credit.id,
      });

  } catch(error) {
    throw new OfficeError(
      503,
      'CREDIT_PDF_FAILED',
      'De creditfactuur is aangemaakt, maar de definitieve PDF kon niet worden voorbereid. De creditfactuur blijft veilig bewaard en kan opnieuw worden verwerkt.'
    );
  }


  const recipientEmail =
    email(
      prepared.snapshot
        ?.debtor
        ?.email
    );


  if (
    !validEmail(
      recipientEmail
    )
  ) {
    throw new OfficeError(
      409,
      'CREDIT_EMAIL_MISSING',
      'De creditfactuur is aangemaakt, maar bij de debiteur ontbreekt een geldig e-mailadres.'
    );
  }


  /*
   * Is deze creditnota al aantoonbaar verzonden?
   * Dan nooit opnieuw mailen via een nieuwe klik.
   */
  const sentDelivery =
    checkQuery(
      await client
        .from(
          'sales_invoice_deliveries'
        )
        .select(
          'id,status,sent_at'
        )
        .eq(
          'organization_id',
          organizationId
        )
        .eq(
          'invoice_id',
          credit.id
        )
        .eq(
          'delivery_type',
          'credit'
        )
        .eq(
          'status',
          'sent'
        )
        .maybeSingle()
    );


  if (sentDelivery) {
    return {
      status:
        200,

      data: {
        creditInvoiceId:
          credit.id,

        creditInvoiceNumber:
          credit.invoice_number,

        created:
          false,

        sent:
          true,

        alreadySent:
          true,

        emailStatus:
          'sent',
      },
    };
  }


  const {
    data: claim,
    error: claimError,
  } =
    await client.rpc(
      'office_claim_credit_delivery',
      {
        p_organization_id:
          organizationId,

        p_invoice_id:
          credit.id,

        p_recipient_email:
          recipientEmail,

        p_idempotency_key:
          idempotencyKey,
      }
    );


  if (
    claimError
    || !claim?.deliveryId
  ) {
    throw new OfficeError(
      409,
      'CREDIT_DELIVERY_CLAIM_FAILED',
      'De creditfactuur is aangemaakt, maar de verzending kon niet veilig worden gestart.'
    );
  }


  if (
    claim.claimed === false
    && claim.status ===
      'sent'
  ) {
    return {
      status:
        200,

      data: {
        creditInvoiceId:
          credit.id,

        creditInvoiceNumber:
          credit.invoice_number,

        sent:
          true,

        alreadySent:
          true,

        emailStatus:
          'sent',
      },
    };
  }


  if (
    claim.claimed === false
  ) {
    /*
     * Pending betekent mogelijk al naar provider
     * gestuurd. Niet automatisch opnieuw verzenden.
     */
    return {
      status:
        202,

      data: {
        creditInvoiceId:
          credit.id,

        creditInvoiceNumber:
          credit.invoice_number,

        sent:
          false,

        emailStatus:
          'unconfirmed',

        message:
          'De verzendstatus moet eerst worden gecontroleerd.',
      },
    };
  }


  try {
    await sendCreditEmail({
      config,
      fetchImpl,
      prepared,
      recipientEmail,
    });

  } catch(error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Onbekende verzendfout.';


    if (
      error?.providerRejected ===
        true
    ) {
      /*
       * EmailJS heeft expliciet geweigerd:
       * veilig als failed registreren.
       */
      await client.rpc(
        'office_finish_credit_delivery',
        {
          p_organization_id:
            organizationId,

          p_delivery_id:
            claim.deliveryId,

          p_status:
            'failed',

          p_error:
            message,
        }
      );


      throw new OfficeError(
        503,
        'CREDIT_EMAIL_FAILED',
        'De creditfactuur is aangemaakt, maar de e-mail is niet verzonden. De verzending kan later opnieuw worden gestart.'
      );
    }


    /*
     * Timeout/netwerkfout:
     * provider kan mogelijk wél hebben verzonden.
     * Pending laten staan voorkomt dubbele mail.
     */
    console.error(
      'credit invoice provider result uncertain',
      {
        organizationId,
        creditInvoiceId:
          credit.id,

        deliveryId:
          claim.deliveryId,
      }
    );


    return {
      status:
        202,

      data: {
        creditInvoiceId:
          credit.id,

        creditInvoiceNumber:
          credit.invoice_number,

        sent:
          false,

        emailStatus:
          'unconfirmed',

        message:
          'De creditfactuur is aangemaakt. De e-mailstatus is nog niet bevestigd; er wordt niet automatisch opnieuw verzonden.',
      },
    };
  }


  /*
   * Provider gaf 2xx.
   * Als logging faalt: NOOIT failed zetten.
   */
  const {
    error: finishError,
  } =
    await client.rpc(
      'office_finish_credit_delivery',
      {
        p_organization_id:
          organizationId,

        p_delivery_id:
          claim.deliveryId,

        p_status:
          'sent',

        p_error:
          null,
      }
    );


  if (finishError) {
    console.error(
      'credit invoice sent but registration failed',
      {
        organizationId,
        creditInvoiceId:
          credit.id,

        deliveryId:
          claim.deliveryId,
      }
    );


    return {
      status:
        202,

      data: {
        creditInvoiceId:
          credit.id,

        creditInvoiceNumber:
          credit.invoice_number,

        sent:
          true,

        emailStatus:
          'unconfirmed',

        message:
          'EmailJS accepteerde de creditfactuur, maar de verzendregistratie moet worden gecontroleerd.',
      },
    };
  }


  return {
    status:
      201,

    data: {
      creditInvoiceId:
        credit.id,

      creditInvoiceNumber:
        credit.invoice_number,

      originalInvoiceId,

      sent:
        true,

      emailStatus:
        'sent',

      recipientEmail,

      pdfFilename:
        prepared.filename,
    },
  };
}
