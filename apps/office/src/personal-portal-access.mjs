import {
  OfficeError,
} from "./auth/supabase.mjs";


const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


const invalid = () =>
  new OfficeError(
    400,
    "INVALID_INPUT",
    "Controleer de aanvraag.",
  );


export async function
personalPortalAccessRoute(
  req,
  url,
  client,
  user,
  readBody,
) {
  const match =
    url.pathname.match(
      /^\/api\/relationships\/([^/]+)\/personal-access$/,
    );


  if (!match) {
    return null;
  }


  const relationshipId =
    decodeURIComponent(
      match[1],
    );


  if (
    !uuid.test(
      relationshipId,
    )
  ) {
    throw invalid();
  }


  if (url.search) {
    throw invalid();
  }


  if (
    req.method === "GET"
  ) {
    const {
      data,
      error,
    } =
      await client.rpc(
        "office_personal_portal_access_read",
        {
          p_relationship_id:
            relationshipId,
        },
      );


    if (error) {
      if (
        error.code ===
        "42501"
      ) {
        throw new OfficeError(
          403,
          "PERSONAL_ACCESS_DENIED",
          "Geen toegang tot persoonlijk portaalbeheer.",
        );
      }

      if (
        error.code ===
        "P0002"
      ) {
        throw new OfficeError(
          404,
          "RELATIONSHIP_UNAVAILABLE",
          "Klantrelatie niet beschikbaar.",
        );
      }

      throw new OfficeError(
        503,
        "PERSONAL_ACCESS_UNAVAILABLE",
        "Persoonlijke toegang kan tijdelijk niet worden geladen.",
      );
    }


    return {
      status: 200,
      data,
    };
  }


  if (
    req.method === "POST"
  ) {
    if (
      !user.canManageCustomers
    ) {
      throw new OfficeError(
        403,
        "WRITE_DENIED",
        "Uw Office-rol heeft alleen leesrechten.",
      );
    }


    const input =
      await readBody(req);


    if (
      typeof input.userId !==
        "string" ||
      !uuid.test(
        input.userId,
      ) ||
      typeof input.enabled !==
        "boolean" ||
      Object.keys(input).some(
        key =>
          ![
            "userId",
            "enabled",
          ].includes(key),
      )
    ) {
      throw invalid();
    }


    const {
      data,
      error,
    } =
      await client.rpc(
        "office_personal_portal_access_set",
        {
          p_relationship_id:
            relationshipId,

          p_target_user_id:
            input.userId,

          p_enabled:
            input.enabled,
        },
      );


    if (error) {
      if (
        error.code ===
        "42501"
      ) {
        throw new OfficeError(
          403,
          "PERSONAL_ACCESS_DENIED",
          "Geen toestemming voor deze wijziging.",
        );
      }

      if (
        error.code ===
        "P0002"
      ) {
        throw new OfficeError(
          404,
          "RELATIONSHIP_UNAVAILABLE",
          "Klantrelatie niet beschikbaar.",
        );
      }

      if (
        [
          "22023",
          "22P02",
        ].includes(
          error.code,
        )
      ) {
        throw invalid();
      }

      throw new OfficeError(
        503,
        "PERSONAL_ACCESS_WRITE_FAILED",
        "De toegang kon niet worden gewijzigd.",
      );
    }


    return {
      status: 200,
      data,
    };
  }


  throw new OfficeError(
    405,
    "METHOD_NOT_ALLOWED",
    "Deze actie is niet toegestaan.",
  );
}
