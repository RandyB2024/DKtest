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


export async function POST() {
  return Response.json(
    {
      error: "Handmatige invoer van bedrijfsmiddelen is niet beschikbaar. Upload een aankoopbon via Documenten.",
    },
    {
      status: 405,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}