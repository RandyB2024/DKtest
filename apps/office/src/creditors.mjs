const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function fail(
  status,
  error,
) {
  return {
    status,
    data: {
      error,
    },
  };
}


export async function creditorsRoute(
  req,
  url,
  client,
) {
  if (
    req.method !== "GET"
    || url.pathname !==
      "/api/creditors"
  ) {
    return null;
  }

  const relationshipId =
    url.searchParams.get(
      "relationshipId",
    );

  if (
    !uuid.test(
      relationshipId ?? "",
    )
  ) {
    return fail(
      400,
      "Ongeldige klantrelatie.",
    );
  }


  // Alle actieve ondernemingen van deze klantrelatie.
  const {
    data:
      organizations,
    error:
      organizationsError,
  } =
    await client
      .from(
        "organizations",
      )
      .select(
        [
          "id",
          "name",
          "legal_name",
          "registration_number",
          "customer_relationship_id",
        ].join(","),
      )
      .eq(
        "customer_relationship_id",
        relationshipId,
      )
      .is(
        "archived_at",
        null,
      )
      .order(
        "name",
        {
          ascending:
            true,
        },
      );


  if (
    organizationsError
  ) {
    console.error(
      "creditor organizations failed",
      {
        code:
          organizationsError.code,
        message:
          organizationsError.message,
      },
    );

    return fail(
      503,
      "Ondernemingen konden niet worden geladen.",
    );
  }


  const result = [];

  for (
    const organization
    of organizations ?? []
  ) {
    const {
      data:
        payables,
      error:
        payablesError,
    } =
      await client.rpc(
        "get_payables",
        {
          p_organization_id:
            organization.id,
        },
      );


    if (
      payablesError
    ) {
      console.error(
        "office get_payables failed",
        {
          organizationId:
            organization.id,
          code:
            payablesError.code,
          message:
            payablesError.message,
        },
      );

      return fail(
        payablesError.code ===
          "42501"
          ? 403
          : 503,
        payablesError.code ===
          "42501"
          ? "Geen toegang tot deze crediteurenadministratie."
          : "Crediteuren konden tijdelijk niet worden geladen.",
      );
    }


    result.push({
      organization: {
        id:
          organization.id,

        name:
          organization.name
          ?? organization
            .legal_name,

        legalName:
          organization
            .legal_name,

        registrationNumber:
          organization
            .registration_number,
      },

      payables:
        payables ?? {
          summary: {},
          aging: {},
          items: [],
          suppliers: [],
          expectedCosts: [],
          missingDocuments: [],
        },
    });
  }


  return {
    status: 200,

    data: {
      relationshipId,

      organizations:
        result,
    },
  };
}
