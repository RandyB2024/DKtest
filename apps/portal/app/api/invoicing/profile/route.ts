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
  max: number,
  required = false,
) {
  if (value === null || value === undefined) {
    if (required) {
      throw new AccessError(
        400,
        `${label} is verplicht.`,
      );
    }

    return "";
  }

  if (typeof value !== "string") {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  const result = value.trim();

  if (required && !result) {
    throw new AccessError(
      400,
      `${label} is verplicht.`,
    );
  }

  if (result.length > max) {
    throw new AccessError(
      400,
      `${label} is te lang.`,
    );
  }

  return result;
}

function address(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new AccessError(
      400,
      "Bedrijfsadres is ongeldig.",
    );
  }

  const input =
    value as Record<string, unknown>;

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
          "get_customer_invoice_profile",
          {
            p_organization_id:
              organizationId,
          },
        );

      if (error) {
        throw new AccessError(
          503,
          "Factuurprofiel kan tijdelijk niet worden geladen.",
        );
      }

      return Response.json({
        profile: data,
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
        await readBody(request);

      const organizationId =
        requireOrganization(
          identity,
          input.organizationId,
        );

      const paymentTerm =
        Number(
          input.defaultPaymentTermDays,
        );

      if (
        !Number.isInteger(paymentTerm) ||
        paymentTerm < 1 ||
        paymentTerm > 365
      ) {
        throw new AccessError(
          400,
          "Betaaltermijn is ongeldig.",
        );
      }

      const {
        data,
        error,
      } =
        await client.rpc(
          "customer_update_invoice_profile",
          {
            p_organization_id:
              organizationId,

            p_company_name:
              text(
                input.companyName,
                "Bedrijfsnaam",
                200,
                true,
              ),

            p_registration_number:
              text(
                input.registrationNumber,
                "KvK-nummer",
                40,
              ),

            p_vat_number:
              text(
                input.vatNumber,
                "Btw-id",
                40,
              ),

            p_phone:
              text(
                input.phone,
                "Telefoonnummer",
                40,
              ),

            p_website:
              text(
                input.website,
                "Website",
                200,
              ),

            p_business_address:
              address(
                input.businessAddress,
              ),

            p_iban:
              text(
                input.iban,
                "IBAN",
                40,
              ),

            p_bic:
              text(
                input.bic,
                "BIC",
                20,
              ),

            p_invoice_email:
              text(
                input.invoiceEmail,
                "Factuur e-mailadres",
                254,
                true,
              ),

            p_footer_text:
              text(
                input.footerText,
                "Voettekst",
                500,
              ),

            p_default_payment_term_days:
              paymentTerm,

            p_invoice_prefix:
              text(
                input.invoicePrefix,
                "Factuurprefix",
                10,
                true,
              ),

            p_credit_prefix:
              text(
                input.creditPrefix,
                "Creditprefix",
                10,
                true,
              ),
          },
        );

      if (error) {
        throw new AccessError(
          400,
          "Factuurprofiel kon niet worden opgeslagen.",
        );
      }

      return Response.json({
        profile: data,
      });
    },
  );
}
