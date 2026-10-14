import {
  checkQuery,
  OfficeError,
} from "./auth/supabase.mjs";


const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function requireOrganizationId(
  value
) {
  if (
    typeof value !== "string" ||
    !uuid.test(value)
  ) {
    throw new OfficeError(
      400,
      "INVALID_ORGANIZATION",
      "Kies een geldige onderneming."
    );
  }

  return value;
}



function requireRecordId(
  value,
  label = "Record"
) {
  if (
    typeof value !== "string" ||
    !uuid.test(value)
  ) {
    throw new OfficeError(
      400,
      "INVALID_RECORD_ID",
      `${label} is ongeldig.`
    );
  }

  return value;
}


function requiredText(
  value,
  label,
  maxLength
) {
  const text =
    typeof value === "string"
      ? value.trim()
      : "";

  if (
    !text ||
    text.length > maxLength
  ) {
    throw new OfficeError(
      400,
      "INVALID_WIZE_RULE",
      `${label} is ongeldig.`
    );
  }

  return text;
}


function integer(
  value,
  fallback = 100
) {
  const number =
    value === undefined
      ? fallback
      : Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > 10000
  ) {
    throw new OfficeError(
      400,
      "INVALID_WIZE_PRIORITY",
      "Ongeldige prioriteit."
    );
  }

  return number;
}


function boolean(
  value
) {
  return value === true;
}


export async function wizeAdminRoute(
  req,
  url,
  client,
  user,
  readBody
) {
  const path =
    url.pathname;

  if (
    path !== "/api/wize-admin"
  ) {
    return null;
  }


  // Alleen Office-rollen die Wize-beheer mogen gebruiken.
  const allowedRoles =
    new Set([
      "owner",
      "admin",
      "accountant",
      "handler",
    ]);

  if (
    !allowedRoles.has(
      user?.roleCode
    )
  ) {
    throw new OfficeError(
      403,
      "WIZE_ADMIN_DENIED",
      "Geen rechten voor Wize-beheer."
    );
  }


  // ==========================================================
  // READ
  // ==========================================================

  if (
    req.method === "GET"
  ) {
    const organizationId =
      requireOrganizationId(
        url.searchParams.get(
          "organizationId"
        )
      );

    const policy =
      checkQuery(
        await client.rpc(
          "wize_get_effective_policy",
          {
            p_organization_id:
              organizationId,
          }
        )
      );


    const appointmentStatus =
      checkQuery(
        await client.rpc(
          "wize_get_appointment_status",
          {
            p_organization_id:
              organizationId,
          }
        )
      );


    const activity =
      checkQuery(
        await client.rpc(
          "office_wize_get_event_activity",
          {
            p_organization_id:
              organizationId,

            p_limit:
              100,
          }
        )
      );


    const signalOverview =
      checkQuery(
        await client.rpc(
          "office_wize_get_signal_overview",
          {
            p_organization_id:
              organizationId,
          }
        )
      );


    return {
      status: 200,

      data: {
        policy,
        appointmentStatus,
        activity,
        signalOverview,
      },
    };
  }


  // ==========================================================
  // MUTATIONS
  // ==========================================================

  if (
    req.method !== "POST"
  ) {
    throw new OfficeError(
      405,
      "METHOD_NOT_ALLOWED",
      "Methode niet toegestaan."
    );
  }


  const input =
    await readBody(req);

  const action =
    typeof input.action === "string"
      ? input.action
      : "";


  // ==========================================================
  // GESPREK AFRONDEN
  // ==========================================================

  if (
    action === "completeAppointment"
  ) {
    const appointmentId =
      requireRecordId(
        input.appointmentId,
        "Afspraak"
      );


    const result =
      checkQuery(
        await client.rpc(
          "office_wize_complete_appointment",
          {
            p_appointment_id:
              appointmentId,
          }
        )
      );


    return {
      status: 200,

      data: {
        appointment:
          result,
      },
    };
  }


  // ==========================================================
  // ALGEMENE REGEL
  // ==========================================================

  if (
    action === "saveGlobalRule"
  ) {
    const result =
      checkQuery(
        await client.rpc(
          "office_wize_upsert_global_rule",
          {
            p_rule_key:
              requiredText(
                input.ruleKey,
                "Regelcode",
                120
              ),

            p_category:
              requiredText(
                input.category,
                "Categorie",
                80
              ),

            p_title:
              requiredText(
                input.title,
                "Titel",
                200
              ),

            p_instruction:
              requiredText(
                input.instruction,
                "Instructie",
                10000
              ),

            p_priority:
              integer(
                input.priority
              ),

            p_enabled:
              input.enabled !== false,
          }
        )
      );

    return {
      status: 200,

      data: {
        id: result,
      },
    };
  }


  // ==========================================================
  // ONDERNEMINGSREGEL
  // ==========================================================

  if (
    action === "saveOrganizationRule"
  ) {
    const organizationId =
      requireOrganizationId(
        input.organizationId
      );

    const allowedModes =
      new Set([
        "add",
        "override",
        "deny",
      ]);

    if (
      !allowedModes.has(
        input.mode
      )
    ) {
      throw new OfficeError(
        400,
        "INVALID_WIZE_MODE",
        "Ongeldige regelmodus."
      );
    }

    const result =
      checkQuery(
        await client.rpc(
          "office_wize_upsert_organization_rule",
          {
            p_organization_id:
              organizationId,

            p_rule_key:
              requiredText(
                input.ruleKey,
                "Regelcode",
                120
              ),

            p_category:
              requiredText(
                input.category,
                "Categorie",
                80
              ),

            p_title:
              requiredText(
                input.title,
                "Titel",
                200
              ),

            p_instruction:
              requiredText(
                input.instruction,
                "Instructie",
                10000
              ),

            p_mode:
              input.mode,

            p_priority:
              integer(
                input.priority
              ),

            p_enabled:
              input.enabled !== false,
          }
        )
      );

    return {
      status: 200,

      data: {
        id: result,
      },
    };
  }


  // ==========================================================
  // BEVOEGDHEDEN
  // ==========================================================

  if (
    action === "saveCapabilities"
  ) {
    const organizationId =
      requireOrganizationId(
        input.organizationId
      );

    const capabilities =
      input.capabilities;

    if (
      !capabilities ||
      typeof capabilities !== "object" ||
      Array.isArray(capabilities)
    ) {
      throw new OfficeError(
        400,
        "INVALID_WIZE_CAPABILITIES",
        "Ongeldige Wize-bevoegdheden."
      );
    }

    const result =
      checkQuery(
        await client.rpc(
          "office_wize_set_capabilities",
          {
            p_organization_id:
              organizationId,

            p_proactive_contact:
              boolean(
                capabilities
                  .proactiveContact
              ),

            p_request_documents:
              boolean(
                capabilities
                  .requestDocuments
              ),

            p_suggest_appointments:
              boolean(
                capabilities
                  .suggestAppointments
              ),

            p_explain_financials:
              boolean(
                capabilities
                  .explainFinancials
              ),

            p_signal_overdue_invoices:
              boolean(
                capabilities
                  .signalOverdueInvoices
              ),

            p_debtor_reminders:
              boolean(
                capabilities
                  .debtorReminders
              ),

            p_suggest_bookings:
              boolean(
                capabilities
                  .suggestBookings
              ),

            p_finalize_bookings:
              boolean(
                capabilities
                  .finalizeBookings
              ),

            p_submit_tax_returns:
              boolean(
                capabilities
                  .submitTaxReturns
              ),

            p_initiate_payments:
              boolean(
                capabilities
                  .initiatePayments
              ),
          }
        )
      );

    return {
      status: 200,

      data: {
        policy: result,
      },
    };
  }


  throw new OfficeError(
    400,
    "INVALID_WIZE_ACTION",
    "Ongeldige Wize-actie."
  );
}
