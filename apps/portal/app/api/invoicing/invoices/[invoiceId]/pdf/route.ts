import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";

import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
} from "@/lib/portal-api";

import {
  ensureFinalInvoicePdf,
} from "@/lib/invoicing/final-invoice-pdf";


const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function pdfResponseBody(
  bytes: Uint8Array,
): ArrayBuffer {
  const copy =
    new Uint8Array(
      bytes.byteLength,
    );

  copy.set(
    bytes,
  );

  return copy.buffer;
}


type Address = {
  street?: string;
  houseNumber?: string;
  addition?: string;
  postalCode?: string;
  city?: string;
  country?: string;
};


function euro(cents: number) {
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


function dateNl(value: string) {
  const date =
    new Date(
      `${value}T00:00:00Z`,
    );

  return new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}


function safeFilename(value: string) {
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
      /^-|-$|^\.+/g,
      "",
    ) || "factuur";
}


function addressLines(
  address:
    | Address
    | null
    | undefined,
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
  ].filter(
    (value): value is string =>
      Boolean(value),
  );
}


function debtorAddressLines(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return [];
  }

  return addressLines(
    value as Address,
  );
}


function wrapText(
  text: string,
  font: {
    widthOfTextAtSize:
      (
        text: string,
        size: number,
      ) => number;
  },
  fontSize: number,
  maxWidth: number,
) {
  const words =
    text
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate =
      line
        ? `${line} ${word}`
        : word;

    if (
      font.widthOfTextAtSize(
        candidate,
        fontSize,
      ) <= maxWidth
    ) {
      line =
        candidate;
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

  return lines.length
    ? lines
    : [""];
}


export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      invoiceId: string;
    }>;
  },
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(identity);

      const {
        invoiceId,
      } =
        await params;

      if (
        !uuidPattern.test(
          invoiceId,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldige factuur.",
        );
      }


      const url =
        new URL(request.url);

      const organizationId =
        requireOrganization(
          identity,
          url.searchParams.get(
            "organizationId",
          ),
        );


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
          .select(`
            id,
            organization_id,
            invoice_number,
            invoice_kind,
            document_status,
            invoice_date,
            due_date,
            currency,
            customer_reference,
            notes,
            subtotal_cents,
            vat_cents,
            total_cents,
            finalized_at,
            debtor:debtors(
              id,
              name,
              email,
              address
            ),
            lines:sales_invoice_lines(
              id,
              description,
              quantity,
              unit_price_cents,
              vat_rate,
              vat_code,
              line_total_cents,
              vat_cents,
              total_incl_vat_cents,
              position
            )
          `)
          .eq(
            "id",
            invoiceId,
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .maybeSingle();


      if (invoiceError) {
        console.error(
          "invoice pdf lookup failed",
          {
            code:
              invoiceError.code,
            message:
              invoiceError.message,
            invoiceId,
          },
        );

        throw new AccessError(
          503,
          "De factuur kan tijdelijk niet worden geopend.",
        );
      }


      if (!invoice) {
        throw new AccessError(
          404,
          "Factuur niet gevonden.",
        );
      }


      /*
       * Definitieve factuur:
       * uitsluitend immutable snapshot/PDF.
       * Nooit opnieuw vanuit actuele
       * bedrijfs- of debiteurgegevens.
       */
      if (
        invoice.document_status !==
        "draft"
      ) {
        let finalPdf;

        try {
          finalPdf =
            await ensureFinalInvoicePdf(
              client,
              organizationId,
              invoiceId,
            );
        } catch (pdfError) {
          console.error(
            "final invoice pdf retrieval failed",
            {
              invoiceId,
              pdfError,
            },
          );

          throw new AccessError(
            503,
            "De definitieve factuur-PDF kan tijdelijk niet worden geopend.",
          );
        }


        const download =
          url.searchParams.get(
            "download",
          ) === "1";


        return new Response(
          pdfResponseBody(
            finalPdf.bytes,
          ),
          {
            status:
              200,

            headers: {
              "content-type":
                "application/pdf",

              "content-disposition":
                `${download ? "attachment" : "inline"}; filename="${finalPdf.filename}"`,

              "cache-control":
                "private, no-store, max-age=0",

              "x-content-type-options":
                "nosniff",
            },
          },
        );
      }


      const {
        data:
          profile,
        error:
          profileError,
      } =
        await client.rpc(
          "get_customer_invoice_profile",
          {
            p_organization_id:
              organizationId,
          },
        );


      if (
        profileError ||
        !profile
      ) {
        throw new AccessError(
          503,
          "Het factuurprofiel kan tijdelijk niet worden geladen.",
        );
      }


      const debtorRaw =
        invoice.debtor;

      const debtor =
        Array.isArray(
          debtorRaw,
        )
          ? debtorRaw[0]
          : debtorRaw;


      if (!debtor) {
        throw new AccessError(
          503,
          "Debiteurgegevens ontbreken.",
        );
      }


      const lines =
        (
          Array.isArray(
            invoice.lines,
          )
            ? invoice.lines
            : []
        )
          .slice()
          .sort(
            (
              a,
              b,
            ) =>
              Number(
                a.position,
              ) -
              Number(
                b.position,
              ),
          );


      if (
        lines.length === 0
      ) {
        throw new AccessError(
          409,
          "De factuur bevat geen factuurregels.",
        );
      }


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
        pageHeight - margin;


      function newPage() {
        page =
          pdf.addPage([
            pageWidth,
            pageHeight,
          ]);

        y =
          pageHeight - margin;
      }


      function ensureSpace(
        needed: number,
      ) {
        if (
          y - needed <
          70
        ) {
          newPage();
        }
      }


      function draw(
        text: string,
        x: number,
        size = 9,
        isBold = false,
      ) {
        page.drawText(
          text,
          {
            x,
            y,
            size,
            font:
              isBold
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
        typeof profile.logoStoragePath ===
          "string" &&
        profile.logoStoragePath
      ) {
        const {
          data:
            logoBlob,
          error:
            logoError,
        } =
          await client.storage
            .from(
              "company-assets",
            )
            .download(
              profile.logoStoragePath,
            );


        if (
          !logoError &&
          logoBlob
        ) {
          try {
            const bytes =
              new Uint8Array(
                await logoBlob.arrayBuffer(),
              );

            const mime =
              logoBlob.type;

            const image =
              mime === "image/png"
                ? await pdf.embedPng(
                    bytes,
                  )
                : await pdf.embedJpg(
                    bytes,
                  );

            const scaled =
              image.scaleToFit(
                150,
                64,
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
          } catch (
            logoEmbedError
          ) {
            console.error(
              "invoice logo embed failed",
              {
                invoiceId,
                logoEmbedError,
              },
            );
          }
        }
      }


      const title =
        invoice.invoice_kind ===
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
            y - 4,

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


      if (
        invoice.document_status ===
          "draft"
      ) {
        page.drawText(
          "CONCEPT",
          {
            x:
              150,

            y:
              370,

            size:
              62,

            font:
              bold,

            rotate:
              degrees(35),

            color:
              rgb(
                0.88,
                0.9,
                0.91,
              ),

            opacity:
              0.65,
          },
        );
      }


      y -=
        Math.max(
          logoHeight,
          50,
        ) + 24;


      draw(
        String(
          profile.companyName ||
          "",
        ),
        margin,
        11,
        true,
      );

      y -= 15;


      for (
        const line of
        addressLines(
          profile.businessAddress,
        )
      ) {
        draw(
          line,
          margin,
          8.5,
        );

        y -= 12;
      }


      const infoX =
        340;

      let infoY =
        pageHeight -
        margin -
        42;


      const invoiceNumber =
        invoice.invoice_number ||
        "Concept";


      const metadata =
        [
          [
            "Factuurnummer",
            invoiceNumber,
          ],
          [
            "Factuurdatum",
            dateNl(
              invoice.invoice_date,
            ),
          ],
          [
            "Vervaldatum",
            dateNl(
              invoice.due_date,
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
              infoX,

            y:
              infoY,

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
          String(value),
          {
            x:
              infoX + 92,

            y:
              infoY,

            size:
              8.5,

            font:
              bold,

            color:
              rgb(
                0.08,
                0.16,
                0.22,
              ),
          },
        );

        infoY -= 14;
      }


      y -= 26;


      draw(
        "FACTUUR AAN",
        margin,
        8,
        true,
      );

      y -= 16;


      draw(
        debtor.name,
        margin,
        10,
        true,
      );

      y -= 14;


      for (
        const line of
        debtorAddressLines(
          debtor.address,
        )
      ) {
        draw(
          line,
          margin,
          8.5,
        );

        y -= 12;
      }


      if (
        invoice.customer_reference
      ) {
        y -= 8;

        draw(
          `Referentie: ${invoice.customer_reference}`,
          margin,
          8.5,
        );

        y -= 12;
      }


      y -= 26;


      const column = {
        description:
          margin,

        quantity:
          325,

        price:
          380,

        vat:
          454,

        total:
          500,
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


      draw(
        "Omschrijving",
        column.description,
        8,
        true,
      );

      draw(
        "Aantal",
        column.quantity,
        8,
        true,
      );

      draw(
        "Prijs",
        column.price,
        8,
        true,
      );

      draw(
        "Btw",
        column.vat,
        8,
        true,
      );

      draw(
        "Totaal",
        column.total,
        8,
        true,
      );


      y -= 30;


      for (
        const line of
        lines
      ) {
        const descriptionLines =
          wrapText(
            String(
              line.description,
            ),
            regular,
            8.5,
            260,
          );


        const rowHeight =
          Math.max(
            20,
            descriptionLines.length *
              11 +
              5,
          );


        ensureSpace(
          rowHeight + 10,
        );


        let descriptionY =
          y;


        for (
          const descriptionLine of
          descriptionLines
        ) {
          page.drawText(
            descriptionLine,
            {
              x:
                column.description,

              y:
                descriptionY,

              size:
                8.5,

              font:
                regular,

              color:
                rgb(
                  0.08,
                  0.16,
                  0.22,
                ),
            },
          );

          descriptionY -= 11;
        }


        draw(
          String(
            Number(
              line.quantity,
            ),
          ),
          column.quantity,
          8.2,
        );


        draw(
          euro(
            Number(
              line.unit_price_cents,
            ),
          ),
          column.price,
          8.2,
        );


        const vatLabel =
          line.vat_code ===
            "exempt"
            ? "Vrij"
            : `${line.vat_rate}%`;


        draw(
          vatLabel,
          column.vat,
          8.2,
        );


        draw(
          euro(
            Number(
              line.total_incl_vat_cents,
            ),
          ),
          column.total,
          8.2,
          true,
        );


        y -=
          rowHeight;


        page.drawLine({
          start: {
            x:
              margin,
            y:
              y + 6,
          },

          end: {
            x:
              pageWidth -
              margin,
            y:
              y + 6,
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


      ensureSpace(145);

      y -= 14;


      const totalsX =
        370;


      const totals =
        [
          [
            "Subtotaal",
            euro(
              Number(
                invoice.subtotal_cents,
              ),
            ),
          ],

          [
            "Btw",
            euro(
              Number(
                invoice.vat_cents,
              ),
            ),
          ],
        ];


      for (
        const [
          label,
          value,
        ] of totals
      ) {
        page.drawText(
          label,
          {
            x:
              totalsX,

            y,

            size:
              9,

            font:
              regular,
          },
        );

        page.drawText(
          value,
          {
            x:
              500,

            y,

            size:
              9,

            font:
              bold,
          },
        );

        y -= 16;
      }

      /*
       * Extra ruimte tussen de Btw-regel en het totaalvlak.
       * Zonder deze ruimte valt het gekleurde vlak gedeeltelijk
       * over de Btw-regel heen.
       */
      y -= 8;


      page.drawRectangle({
        x:
          totalsX - 8,

        y:
          y - 7,

        width:
          pageWidth -
          margin -
          totalsX +
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


      page.drawText(
        "Totaal",
        {
          x:
            totalsX,

          y,

          size:
            11,

          font:
            bold,
        },
      );


      page.drawText(
        euro(
          Number(
            invoice.total_cents,
          ),
        ),
        {
          x:
            490,

          y,

          size:
            11,

          font:
            bold,
        },
      );


      y -= 42;


      if (
        profile.iban
      ) {
        const paymentText =
          `Betaling graag uiterlijk ${dateNl(
            invoice.due_date,
          )} op ${profile.iban}` +
          (
            invoice.invoice_number
              ? ` onder vermelding van ${invoice.invoice_number}.`
              : "."
          );


        for (
          const line of
          wrapText(
            paymentText,
            regular,
            8.5,
            pageWidth -
              margin * 2,
          )
        ) {
          draw(
            line,
            margin,
            8.5,
          );

          y -= 12;
        }
      }


      if (
        invoice.notes
      ) {
        y -= 7;

        for (
          const line of
          wrapText(
            String(
              invoice.notes,
            ),
            regular,
            8,
            pageWidth -
              margin * 2,
          )
        ) {
          draw(
            line,
            margin,
            8,
          );

          y -= 11;
        }
      }


      const footerParts =
        [
          profile.registrationNumber
            ? `KvK ${profile.registrationNumber}`
            : "",

          profile.vatNumber
            ? `Btw ${profile.vatNumber}`
            : "",

          profile.invoiceEmail
            ? String(
                profile.invoiceEmail,
              )
            : "",

          profile.phone
            ? String(
                profile.phone,
              )
            : "",

          profile.website
            ? String(
                profile.website,
              )
            : "",
        ].filter(Boolean);


      for (
        const currentPage of
        pdf.getPages()
      ) {
        if (
          profile.footerText
        ) {
          const footerLines =
            wrapText(
              String(
                profile.footerText,
              ),
              regular,
              7,
              pageWidth -
                margin * 2,
            )
              .slice(
                0,
                2,
              );

          let footerY =
            45 +
            (
              footerLines.length *
              9
            );

          for (
            const footerLine of
            footerLines
          ) {
            currentPage.drawText(
              footerLine,
              {
                x:
                  margin,

                y:
                  footerY,

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

            footerY -= 9;
          }
        }


        if (
          footerParts.length
        ) {
          currentPage.drawText(
            footerParts.join(
              "  •  ",
            ),
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
      }


      const bytes =
        await pdf.save();


      const isDraft =
        invoice.document_status ===
          "draft";


      const baseName =
        isDraft
          ? `concept-factuur-${invoice.id}`
          : `factuur-${invoice.invoice_number || invoice.id}`;


      const filename =
        `${safeFilename(baseName)}.pdf`;


      const download =
        url.searchParams.get(
          "download",
        ) === "1";


      return new Response(
        pdfResponseBody(
          bytes,
        ),
        {
          status:
            200,

          headers: {
            "content-type":
              "application/pdf",

            "content-disposition":
              `${download ? "attachment" : "inline"}; filename="${filename}"`,

            "cache-control":
              "private, no-store, max-age=0",

            "x-content-type-options":
              "nosniff",
          },
        },
      );
    },
  );
}
