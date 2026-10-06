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


function paymentTerm(
  value: unknown,
) {
  const result =
    Number(value);

  if (
    !Number.isInteger(result) ||
    result < 1 ||
    result > 365
  ) {
    throw new AccessError(
      400,
      "Betaaltermijn is ongeldig.",
    );
  }

  return result;
}


function address(
  value: unknown,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new AccessError(
      400,
      "Adres is ongeldig.",
    );
  }

  const input =
    value as Record<
      string,
      unknown
    >;

  const allowed =
    new Set([
      "street",
      "houseNumber",
      "addition",
      "postalCode",
      "city",
      "country",
    ]);

  for (
    const key of
      Object.keys(input)
  ) {
    if (!allowed.has(key)) {
      throw new AccessError(
        400,
        "Adres bevat een ongeldig veld.",
      );
    }
  }

  return {
    street:
      text(
        input.street,
        "Straat",
        120,
      ),

    houseNumber:
      text(
        input.houseNumber,
        "Huisnummer",
        20,
      ),

    addition:
      text(
        input.addition,
        "Toevoeging",
        20,
      ),

    postalCode:
      text(
        input.postalCode,
        "Postcode",
        20,
      ),

    city:
      text(
        input.city,
        "Plaats",
        100,
      ),

    country:
      text(
        input.country,
        "Land",
        80,
      ) || "Nederland",
  };
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
          "get_customer_debtors",
          {
            p_organization_id:
              organizationId,
          },
        );

      if (error) {
        throw new AccessError(
          503,
          "Debiteuren kunnen tijdelijk niet worden geladen.",
        );
      }

      return Response.json({
        debtors:
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
        text(
          input.action,
          "Actie",
          20,
          true,
        );

      if (
        action === "create"
      ) {
        const {
          data,
          error,
        } =
          await client.rpc(
            "customer_create_debtor",
            {
              p_organization_id:
                organizationId,

              p_name:
                text(
                  input.name,
                  "Naam",
                  160,
                  true,
                ),

              p_contact_name:
                text(
                  input.contactName,
                  "Contactpersoon",
                  160,
                ),

              p_email:
                text(
                  input.email,
                  "E-mailadres",
                  254,
                  true,
                ),

              p_phone:
                text(
                  input.phone,
                  "Telefoonnummer",
                  40,
                ),

              p_kvk_number:
                text(
                  input.kvkNumber,
                  "KvK-nummer",
                  20,
                ),

              p_vat_number:
                text(
                  input.vatNumber,
                  "Btw-id",
                  40,
                ),

              p_reference:
                text(
                  input.reference,
                  "Referentie",
                  100,
                ),

              p_payment_term_days:
                paymentTerm(
                  input.paymentTermDays,
                ),

              p_address:
                address(
                  input.address,
                ),
            },
          );

        if (error) {
          throw new AccessError(
            400,
            "Debiteur kon niet worden toegevoegd.",
          );
        }

        return Response.json(
          {
            debtorId:
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
        const debtorId =
          uuid(
            input.debtorId,
            "Debiteur",
          );

        const {
          data,
          error,
        } =
          await client.rpc(
            "customer_update_debtor",
            {
              p_organization_id:
                organizationId,

              p_debtor_id:
                debtorId,

              p_name:
                text(
                  input.name,
                  "Naam",
                  160,
                  true,
                ),

              p_contact_name:
                text(
                  input.contactName,
                  "Contactpersoon",
                  160,
                ),

              p_email:
                text(
                  input.email,
                  "E-mailadres",
                  254,
                  true,
                ),

              p_phone:
                text(
                  input.phone,
                  "Telefoonnummer",
                  40,
                ),

              p_kvk_number:
                text(
                  input.kvkNumber,
                  "KvK-nummer",
                  20,
                ),

              p_vat_number:
                text(
                  input.vatNumber,
                  "Btw-id",
                  40,
                ),

              p_reference:
                text(
                  input.reference,
                  "Referentie",
                  100,
                ),

              p_payment_term_days:
                paymentTerm(
                  input.paymentTermDays,
                ),

              p_address:
                address(
                  input.address,
                ),
            },
          );

        if (error) {
          throw new AccessError(
            400,
            "Debiteur kon niet worden bijgewerkt.",
          );
        }

        return Response.json({
          debtorId:
            data,
        });
      }


      if (
        action === "archive"
      ) {
        throw new AccessError(
          403,
          "Debiteuren archiveren kan alleen door Bestemd Office.",
        );
      }


      throw new AccessError(
        400,
        "Ongeldige actie.",
      );
    },
  );
}
