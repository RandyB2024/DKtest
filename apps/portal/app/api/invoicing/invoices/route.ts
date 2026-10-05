import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
  readBody,
} from "@/lib/portal-api";


const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function uuid(
  value: unknown,
  label: string,
) {
  if (
    typeof value !== "string" ||
    !uuidPattern.test(value)
  ) {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  return value;
}


function stringValue(
  value: unknown,
  label: string,
  maxLength: number,
  required = false,
) {
  if (
    value === undefined ||
    value === null
  ) {
    if (required) {
      throw new AccessError(
        400,
        `${label} is verplicht.`,
      );
    }

    return "";
  }

  if (
    typeof value !== "string"
  ) {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  const result =
    value.trim();

  if (
    required &&
    !result
  ) {
    throw new AccessError(
      400,
      `${label} is verplicht.`,
    );
  }

  if (
    result.length > maxLength
  ) {
    throw new AccessError(
      400,
      `${label} is te lang.`,
    );
  }

  return result;
}


function dateValue(
  value: unknown,
) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new AccessError(
      400,
      "Factuurdatum is ongeldig.",
    );
  }

  return value;
}


function invoiceLines(
  value: unknown,
) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 100
  ) {
    throw new AccessError(
      400,
      "Voeg minimaal één factuurregel toe.",
    );
  }

  return value.map(
    (raw, index) => {
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
      ) {
        throw new AccessError(
          400,
          `Factuurregel ${index + 1} is ongeldig.`,
        );
      }

      const line =
        raw as Record<
          string,
          unknown
        >;

      const description =
        stringValue(
          line.description,
          "Omschrijving",
          500,
          true,
        );

      const quantity =
        Number(
          line.quantity,
        );

      if (
        !Number.isFinite(
          quantity,
        ) ||
        quantity <= 0 ||
        quantity > 1000000
      ) {
        throw new AccessError(
          400,
          `Aantal van factuurregel ${index + 1} is ongeldig.`,
        );
      }


      const unitPriceCents =
        Number(
          line.unitPriceCents,
        );

      if (
        !Number.isSafeInteger(
          unitPriceCents,
        ) ||
        unitPriceCents < 0
      ) {
        throw new AccessError(
          400,
          `Prijs van factuurregel ${index + 1} is ongeldig.`,
        );
      }


      const vatCode =
        stringValue(
          line.vatCode,
          "Btw-code",
          20,
          true,
        );

      if (
        ![
          "21",
          "9",
          "0",
          "exempt",
        ].includes(
          vatCode,
        )
      ) {
        throw new AccessError(
          400,
          `Btw-code van factuurregel ${index + 1} is ongeldig.`,
        );
      }


      return {
        description,
        quantity,
        unitPriceCents,
        vatCode,
      };
    },
  );
}


export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(identity);

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
        data,
        error,
      } =
        await client.rpc(
          "get_customer_invoice_drafts",
          {
            p_organization_id:
              organizationId,
          },
        );


      if (error) {
        throw new AccessError(
          503,
          "Conceptfacturen kunnen tijdelijk niet worden geladen.",
        );
      }


      return Response.json({
        drafts:
          data ?? [],
      });
    },
  );
}


export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(identity);


      const input =
        await readBody(
          request,
        );


      const organizationId =
        requireOrganization(
          identity,
          input.organizationId,
        );


      const action =
        stringValue(
          input.action,
          "Actie",
          20,
          true,
        );


      if (
        action === "delete"
      ) {
        const {
          data,
          error,
        } =
          await client.rpc(
            "customer_delete_invoice_draft",
            {
              p_organization_id:
                organizationId,

              p_invoice_id:
                uuid(
                  input.invoiceId,
                  "Factuur",
                ),
            },
          );


        if (error) {
          throw new AccessError(
            409,
            "Conceptfactuur kon niet worden verwijderd.",
          );
        }


        return Response.json({
          invoiceId:
            data,
        });
      }


      const debtorId =
        uuid(
          input.debtorId,
          "Debiteur",
        );


      const invoiceDate =
        dateValue(
          input.invoiceDate,
        );


      const customerReference =
        stringValue(
          input.customerReference,
          "Referentie",
          120,
        );


      const notes =
        stringValue(
          input.notes,
          "Notitie",
          2000,
        );


      const lines =
        invoiceLines(
          input.lines,
        );


      if (
        action === "create"
      ) {
        const {
          data,
          error,
        } =
          await client.rpc(
            "customer_create_invoice_draft",
            {
              p_organization_id:
                organizationId,

              p_debtor_id:
                debtorId,

              p_invoice_date:
                invoiceDate,

              p_customer_reference:
                customerReference,

              p_notes:
                notes,

              p_lines:
                lines,
            },
          );


        if (error) {
          throw new AccessError(
            400,
            "Conceptfactuur kon niet worden opgeslagen.",
          );
        }


        return Response.json(
          {
            invoiceId:
              data,
          },
          {
            status: 201,
          },
        );
      }


      if (
        action === "update"
      ) {
        const {
          data,
          error,
        } =
          await client.rpc(
            "customer_update_invoice_draft",
            {
              p_organization_id:
                organizationId,

              p_invoice_id:
                uuid(
                  input.invoiceId,
                  "Factuur",
                ),

              p_debtor_id:
                debtorId,

              p_invoice_date:
                invoiceDate,

              p_customer_reference:
                customerReference,

              p_notes:
                notes,

              p_lines:
                lines,
            },
          );


        if (error) {
          throw new AccessError(
            400,
            "Conceptfactuur kon niet worden bijgewerkt.",
          );
        }


        return Response.json({
          invoiceId:
            data,
        });
      }


      throw new AccessError(
        400,
        "Ongeldige actie.",
      );
    },
  );
}
