import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  ConfigurationError,
  publicSupabaseConfig,
} from "@/lib/supabase/config";


type SnapshotLine = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
  vatCode: string;
  lineTotalCents: number;
  vatCents: number;
  totalInclVatCents: number;
  position: number;
};


type InvoiceSnapshot = {
  schemaVersion: number;

  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceKind: string;
    invoiceDate: string;
    dueDate: string;
    currency: string;
    customerReference: string | null;
    notes: string | null;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
  };

  seller: {
    companyName: string;
    registrationNumber: string | null;
    vatNumber: string | null;
    phone: string | null;
    website: string | null;

    businessAddress:
      Record<string, string>;

    iban: string | null;
    bic: string | null;
    invoiceEmail: string | null;
    footerText: string | null;
    logoStoragePath: string | null;
  };

  debtor: {
    name: string;
    email: string;
    address:
      Record<string, string>;
  };

  lines: SnapshotLine[];

  finalizedAt: string;
};


export type FinalInvoicePdf = {
  bytes: Uint8Array;
  path: string;
  filename: string;
};


function adminClient() {
  const {
    url,
  } =
    publicSupabaseConfig();

  const key =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new ConfigurationError();
  }

  return createClient(
    url,
    key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}


function euro(
  cents: number,
) {
  return new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
    },
  ).format(
    cents / 100,
  );
}
function moneyColumn(
  value: string,
) {
  return value.padStart(
    9,
    " ",
  );
}



function dateNl(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(
    new Date(
      `${value}T00:00:00Z`,
    ),
  );
}


function safeFilename(
  value: string,
) {
  return value
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-",
    )
    .replace(
      /-+/g,
      "-",
    )
    .replace(
      /^[-.]+|[-.]+$/g,
      "",
    ) || "factuur";
}


function addressLines(
  address:
    Record<string, string> |
    null |
    undefined,
) {
  if (!address) {
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
        .join(""),
    ]
      .filter(Boolean)
      .join(" ");

  const second =
    [
      address.postalCode,
      address.city,
    ]
      .filter(Boolean)
      .join(" ");

  return [
    first,
    second,
    address.country,
  ].filter(Boolean);
}


function wrap(
  value: string,
  font: {
    widthOfTextAtSize:
      (
        text: string,
        size: number,
      ) => number;
  },
  size: number,
  maxWidth: number,
) {
  const words =
    value
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next =
      line
        ? `${line} ${word}`
        : word;

    if (
      font.widthOfTextAtSize(
        next,
        size,
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


async function renderPdf(
  snapshot: InvoiceSnapshot,
) {
  const pdf =
    await PDFDocument.create();

  const regular =
    await pdf.embedFont(
      StandardFonts.Helvetica,
    );

  const bold =
    await pdf.embedFont(
      StandardFonts.HelveticaBold,
    );

  const pageWidth =
    595.28;

  const pageHeight =
    841.89;

  const margin =
    46;

  let page =
    pdf.addPage([
      pageWidth,
      pageHeight,
    ]);

  let y =
    pageHeight -
    margin;


  function newPage() {
    page =
      pdf.addPage([
        pageWidth,
        pageHeight,
      ]);

    y =
      pageHeight -
      margin;
  }


  function ensure(
    needed: number,
  ) {
    if (
      y - needed <
      75
    ) {
      newPage();
    }
  }


  function text(
    value: string,
    x: number,
    size = 9,
    strong = false,
  ) {
    page.drawText(
      value,
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
            0.22,
          ),
      },
    );
  }


  let logoHeight =
    0;

  if (
    snapshot.seller
      .logoStoragePath
  ) {
    const admin =
      adminClient();

    const {
      data,
      error,
    } =
      await admin.storage
        .from(
          "company-assets",
        )
        .download(
          snapshot.seller
            .logoStoragePath,
        );

    if (
      !error &&
      data
    ) {
      try {
        const bytes =
          new Uint8Array(
            await data.arrayBuffer(),
          );

        const image =
          data.type ===
            "image/png"
            ? await pdf.embedPng(
                bytes,
              )
            : await pdf.embedJpg(
                bytes,
              );

        const scaled =
          image.scaleToFit(
            150,
            60,
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
          },
        );

        logoHeight =
          scaled.height;
      } catch {
        // Factuur blijft geldig
        // als logo technisch niet
        // gerenderd kan worden.
      }
    }
  }


  const title =
    snapshot.invoice
      .invoiceKind ===
      "credit"
      ? "CREDITFACTUUR"
      : "FACTUUR";


  page.drawText(
    title,
    {
      x:
        pageWidth -
        margin -
        bold.widthOfTextAtSize(
          title,
          22,
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
          0.32,
        ),
    },
  );


  y -=
    Math.max(
      logoHeight,
      48,
    ) + 22;


  text(
    snapshot.seller
      .companyName,
    margin,
    11,
    true,
  );

  y -= 15;


  for (
    const line of
    addressLines(
      snapshot.seller
        .businessAddress,
    )
  ) {
    text(
      line,
      margin,
      8.5,
    );

    y -= 12;
  }


  const metaX =
    342;

  let metaY =
    pageHeight -
    margin -
    42;


  const metadata = [
    [
      "Factuurnummer",
      snapshot.invoice
        .invoiceNumber,
    ],

    [
      "Factuurdatum",
      dateNl(
        snapshot.invoice
          .invoiceDate,
      ),
    ],

    [
      "Vervaldatum",
      dateNl(
        snapshot.invoice
          .dueDate,
      ),
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
            0.48,
          ),
      },
    );

    page.drawText(
      value,
      {
        x:
          metaX + 90,

        y:
          metaY,

        size:
          8.5,

        font:
          bold,
      },
    );

    metaY -= 14;
  }


  y -= 28;

  text(
    "FACTUUR AAN",
    margin,
    8,
    true,
  );

  y -= 16;

  text(
    snapshot.debtor.name,
    margin,
    10,
    true,
  );

  y -= 14;


  for (
    const line of
    addressLines(
      snapshot.debtor.address,
    )
  ) {
    text(
      line,
      margin,
      8.5,
    );

    y -= 12;
  }


  if (
    snapshot.invoice
      .customerReference
  ) {
    y -= 6;

    text(
      `Referentie: ${snapshot.invoice.customerReference}`,
      margin,
      8.5,
    );

    y -= 12;
  }


  y -= 24;


  const cols = {
    description: margin,
    quantity: 325,
    price: 380,
    vat: 454,
    total: 500,
  };


  page.drawRectangle({
    x:
      margin,

    y:
      y - 5,

    width:
      pageWidth -
      margin * 2,

    height:
      24,

    color:
      rgb(
        0.94,
        0.97,
        0.98,
      ),
  });


  text(
    "Omschrijving",
    cols.description,
    8,
    true,
  );

  text(
    "Aantal",
    cols.quantity,
    8,
    true,
  );

  text(
    "Prijs",
    cols.price,
    8,
    true,
  );

  text(
    "Btw",
    cols.vat,
    8,
    true,
  );

  text(
    "Totaal",
    cols.total,
    8,
    true,
  );

  y -= 30;


  const lines =
    [...snapshot.lines]
      .sort(
        (
          a,
          b,
        ) =>
          a.position -
          b.position,
      );


  for (
    const line of lines
  ) {
    const description =
      wrap(
        line.description,
        regular,
        8.5,
        260,
      );

    const height =
      Math.max(
        20,
        description.length *
          11 +
          5,
      );

    ensure(
      height + 10,
    );

    let descriptionY =
      y;

    for (
      const current of
      description
    ) {
      page.drawText(
        current,
        {
          x:
            cols.description,

          y:
            descriptionY,

          size:
            8.5,

          font:
            regular,
        },
      );

      descriptionY -= 14;
    }

    text(
      String(
        Number(
          line.quantity,
        ),
      ),
      cols.quantity,
      8.2,
    );

    text(
      moneyColumn(
        euro(
          line.unitPriceCents,
        ),
      ),
      cols.price,
      8.2,
    );

    text(
      line.vatCode ===
        "exempt"
        ? "Vrij"
        : `${line.vatRate}%`,
      cols.vat,
      8.2,
    );

    text(
      moneyColumn(
        euro(
          line.totalInclVatCents,
        ),
      ),
      cols.total,
      8.2,
      true,
    );

    y -= height;

    page.drawLine({
      start: {
        x:
          margin,

        y:
          y + 0,
      },

      end: {
        x:
          pageWidth -
          margin,

        y:
          y + 0,
      },

      thickness:
        0.5,

      color:
        rgb(
          0.88,
          0.9,
          0.91,
        ),
    });
  }


  ensure(145);

  y -= 14;


  const totalX =
    370;


  text(
    "Subtotaal",
    totalX,
    9,
  );

  text(
    moneyColumn(
      euro(
        snapshot.invoice
          .subtotalCents,
    ),
    500,
    9,
    true,
  );

  y -= 16;


  text(
    "Btw",
    totalX,
    9,
  );

  text(
    moneyColumn(
      euro(
        snapshot.invoice
          .vatCents,
    ),
    500,
    9,
    true,
  );

  /*
   * Extra ruimte tussen de Btw-regel en het totaalvlak.
   * Zo blijft het volledige Btw-bedrag zichtbaar.
   */
  y -= 25;


  page.drawRectangle({
    x:
      totalX - 8,

    y:
      y - 7,

    width:
      pageWidth -
      margin -
      totalX +
      8,

    height:
      27,

    color:
      rgb(
        0.9,
        0.96,
        0.97,
      ),
  });


  text(
    "Totaal",
    totalX,
    11,
    true,
  );

  text(
    moneyColumn(
      euro(
        snapshot.invoice
          .totalCents,
    ),
    ),
    ),
    ),
    490,
    11,
    true,
  );

  y -= 42;


  if (
    snapshot.seller.iban
  ) {
    const payment =
      `Betaling graag uiterlijk ${dateNl(
        snapshot.invoice.dueDate,
      )} op ${snapshot.seller.iban} onder vermelding van ${snapshot.invoice.invoiceNumber}.`;

    for (
      const line of
      wrap(
        payment,
        regular,
        8.5,
        pageWidth -
        margin * 2,
      )
    ) {
      text(
        line,
        margin,
        8.5,
      );

      y -= 12;
    }
  }


  if (
    snapshot.invoice.notes
  ) {
    y -= 7;

    for (
      const line of
      wrap(
        snapshot.invoice.notes,
        regular,
        8,
        pageWidth -
        margin * 2,
      )
    ) {
      text(
        line,
        margin,
        8,
      );

      y -= 11;
    }
  }


  const footer =
    [
      snapshot.seller
        .registrationNumber
        ? `KvK ${snapshot.seller.registrationNumber}`
        : "",

      snapshot.seller
        .vatNumber
        ? `Btw ${snapshot.seller.vatNumber}`
        : "",

      snapshot.seller
        .invoiceEmail ??
        "",

      snapshot.seller
        .phone ??
        "",

      snapshot.seller
        .website ??
        "",
    ]
      .filter(Boolean)
      .join("  •  ");


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
              0.5,
            ),
        },
      );
    }


    if (
      snapshot.seller
        .footerText
    ) {
      currentPage.drawText(
        snapshot.seller
          .footerText
          .slice(
            0,
            240,
          ),
        {
          x:
            margin,

          y:
            44,

          size:
            7,

          font:
            regular,

          color:
            rgb(
              0.4,
              0.45,
              0.48,
            ),
        },
      );
    }
  }


  return new Uint8Array(
    await pdf.save(),
  );
}


export async function ensureFinalInvoicePdf(
  client: SupabaseClient,
  organizationId: string,
  invoiceId: string,
): Promise<FinalInvoicePdf> {

  const {
    data:
      invoice,
    error:
      invoiceError,
  } =
    await client
      .from(
        "sales_invoices",
      )
      .select(
        "id,organization_id,invoice_number,document_status,pdf_storage_path",
      )
      .eq(
        "id",
        invoiceId,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .maybeSingle();


  if (
    invoiceError ||
    !invoice
  ) {
    throw new Error(
      "Definitieve factuur kon niet worden geladen.",
    );
  }


  if (
    invoice.document_status ===
      "draft" ||
    !invoice.invoice_number
  ) {
    throw new Error(
      "De factuur is nog niet definitief.",
    );
  }


  const admin =
    adminClient();


  const filename =
    `${safeFilename(
      `factuur-${invoice.invoice_number}`,
    )}.pdf`;


  if (
    invoice.pdf_storage_path
  ) {
    const {
      data,
      error,
    } =
      await admin.storage
        .from(
          "invoice-pdfs",
        )
        .download(
          invoice.pdf_storage_path,
        );

    if (
      !error &&
      data
    ) {
      return {
        bytes:
          new Uint8Array(
            await data.arrayBuffer(),
          ),

        path:
          invoice.pdf_storage_path,

        filename,
      };
    }
  }


  const {
    data:
      payload,
    error:
      payloadError,
  } =
    await client.rpc(
      "get_customer_invoice_pdf_payload",
      {
        p_organization_id:
          organizationId,

        p_invoice_id:
          invoiceId,
      },
    );


  if (
    payloadError ||
    !payload
  ) {
    throw new Error(
      "Historische factuurgegevens konden niet worden geladen.",
    );
  }


  const snapshot =
    payload as InvoiceSnapshot;


  const bytes =
    await renderPdf(
      snapshot,
    );


  const path =
    `${organizationId}/${invoiceId}/${filename}`;


  const {
    error:
      uploadError,
  } =
    await admin.storage
      .from(
        "invoice-pdfs",
      )
      .upload(
        path,
        bytes,
        {
          contentType:
            "application/pdf",

          cacheControl:
            "31536000",

          upsert:
            false,
        },
      );


  if (uploadError) {
    /*
     * Mogelijke retry/race:
     * als het object al bestaat,
     * gebruiken we exact dat bestand.
     */
    const {
      data:
        existing,
      error:
        existingError,
    } =
      await admin.storage
        .from(
          "invoice-pdfs",
        )
        .download(
          path,
        );

    if (
      existingError ||
      !existing
    ) {
      throw new Error(
        "Definitieve factuur-PDF kon niet worden opgeslagen.",
      );
    }

    const existingBytes =
      new Uint8Array(
        await existing.arrayBuffer(),
      );

    await admin
      .from(
        "sales_invoices",
      )
      .update({
        pdf_storage_path:
          path,
      })
      .eq(
        "id",
        invoiceId,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .is(
        "pdf_storage_path",
        null,
      );

    return {
      bytes:
        existingBytes,

      path,

      filename,
    };
  }


  const {
    error:
      updateError,
  } =
    await admin
      .from(
        "sales_invoices",
      )
      .update({
        pdf_storage_path:
          path,
      })
      .eq(
        "id",
        invoiceId,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .is(
        "pdf_storage_path",
        null,
      );


  if (updateError) {
    throw new Error(
      "Definitieve PDF is opgeslagen, maar kon niet aan de factuur worden gekoppeld.",
    );
  }


  return {
    bytes,
    path,
    filename,
  };
}


/*
 * BESTEMD SIGNED INVOICE DOWNLOAD V1
 *
 * Maakt uitsluitend een tijdelijke downloadlink
 * voor een reeds definitief opgeslagen factuur-PDF.
 *
 * De invoice-pdfs bucket blijft privé.
 */
export async function createFinalInvoiceDownloadUrl(
  organizationId: string,
  invoiceId: string,
  expiresInSeconds = 60 * 60 * 24 * 30,
) {
  const admin =
    adminClient();

  const {
    data: invoice,
    error: invoiceError,
  } =
    await admin
      .from(
        "sales_invoices",
      )
      .select(
        "id,organization_id,invoice_number,document_status,pdf_storage_path",
      )
      .eq(
        "id",
        invoiceId,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .maybeSingle();


  if (
    invoiceError ||
    !invoice
  ) {
    throw new Error(
      "Factuur kon niet worden geladen.",
    );
  }


  if (
    invoice.document_status ===
      "draft" ||
    !invoice.invoice_number
  ) {
    throw new Error(
      "Alleen definitieve facturen kunnen worden gedeeld.",
    );
  }


  /*
   * Zorg ervoor dat de definitieve PDF bestaat.
   * Dit gebruikt altijd de immutable snapshot.
   */
  const finalPdf =
    await ensureFinalInvoicePdf(
      admin,
      organizationId,
      invoiceId,
    );


  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        "invoice-pdfs",
      )
      .createSignedUrl(
        finalPdf.path,
        expiresInSeconds,
        {
          download:
            finalPdf.filename,
        },
      );


  if (
    error ||
    !data?.signedUrl
  ) {
    throw new Error(
      "De beveiligde factuurlink kon niet worden aangemaakt.",
    );
  }


  return {
    url:
      data.signedUrl,

    filename:
      finalPdf.filename,

    expiresInSeconds,
  };
}
