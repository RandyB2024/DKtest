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


function text(
  value: unknown,
  label: string,
  maxLength: number,
  required = false,
) {
  if (
    value === null ||
    value === undefined
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


function cents(
  value: unknown,
  label: string,
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const result =
    Number(value);

  if (
    !Number.isSafeInteger(result) ||
    result < 0
  ) {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  return result;
}


function integer(
  value: unknown,
  label: string,
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const result =
    Number(value);

  if (
    !Number.isSafeInteger(result) ||
    result < 0
  ) {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  return result;
}


function optionalDate(
  value: unknown,
) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new AccessError(
      400,
      "Aanschafdatum is ongeldig.",
    );
  }

  return value;
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
          "get_customer_inventory",
          {
            p_organization_id:
              organizationId,
          },
        );


      if (error) {
        console.error(
          "get_customer_inventory failed",
          {
            code:
              error.code,
            message:
              error.message,
          },
        );

        throw new AccessError(
          503,
          "Inventaris kan tijdelijk niet worden geladen.",
        );
      }


      return Response.json({
        items:
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


      const category =
        text(
          input.category,
          "Categorie",
          30,
          true,
        );


      if (
        ![
          "vehicle",
          "equipment",
          "ict",
          "furniture",
          "other",
        ].includes(
          category,
        )
      ) {
        throw new AccessError(
          400,
          "Categorie is ongeldig.",
        );
      }


      const {
        data,
        error,
      } =
        await client.rpc(
          "customer_create_inventory_item",
          {
            p_organization_id:
              organizationId,

            p_category:
              category,

            p_name:
              text(
                input.name,
                "Naam",
                160,
                true,
              ),

            p_description:
              text(
                input.description,
                "Omschrijving",
                500,
              ),

            p_purchase_date:
              optionalDate(
                input.purchaseDate,
              ),

            p_purchase_value_cents:
              cents(
                input.purchaseValueCents,
                "Aanschafwaarde",
              ),

            p_book_value_cents:
              cents(
                input.bookValueCents,
                "Boekwaarde",
              ),

            p_make:
              text(
                input.make,
                "Merk",
                120,
              ),

            p_model:
              text(
                input.model,
                "Model",
                120,
              ),

            p_license_plate:
              text(
                input.licensePlate,
                "Kenteken",
                30,
              ),

            p_serial_number:
              text(
                input.serialNumber,
                "Serienummer",
                120,
              ),

            p_odometer_km:
              integer(
                input.odometerKm,
                "Kilometerstand",
              ),

            p_location:
              text(
                input.location,
                "Locatie",
                160,
              ),

            p_notes:
              text(
                input.notes,
                "Notities",
                2000,
              ),
          },
        );


      if (error) {
        console.error(
          "customer_create_inventory_item failed",
          {
            code:
              error.code,
            message:
              error.message,
          },
        );

        throw new AccessError(
          400,
          "Bedrijfsmiddel kon niet worden toegevoegd.",
        );
      }


      return Response.json(
        {
          itemId:
            data,
        },
        {
          status:
            201,
        },
      );
    },
  );
}
