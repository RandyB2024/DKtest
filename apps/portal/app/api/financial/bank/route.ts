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

type BankAccount = {
  id: string;
  provider: string;
  providerAccountId: string | null;
  iban: string | null;
  accountName: string;
  currency: string;
  status: string;
  lastSyncedAt: string | null;
};

type BankTransaction = {
  id: string;

  bankAccount: {
    id: string;
    name: string;
    iban: string | null;
  };

  bookedAt: string;
  valueDate: string | null;

  amountCents: number;
  currency: string;

  counterpartyName: string | null;
  counterpartyIban: string | null;

  description: string | null;
  reference: string | null;
  endToEndId: string | null;

  status: string;
  reconciliationStatus: string;

  paymentId: string | null;
};

type BankTransactionsResponse = {
  summary: {
    count: number;
    unmatchedCount: number;
    suggestedCount: number;
    matchedCount: number;
  };

  items: BankTransaction[];
};

type MatchSuggestion = {
  transactionId: string;

  amountCents: number;
  bookedAt: string;

  counterpartyName: string | null;
  description: string | null;
  reference: string | null;

  suggestion: null | {
    invoiceId: string;

    invoiceType:
      | "sales"
      | "purchase";

    invoiceNumber: string;
    relationName: string;

    totalCents: number;
    paidCents: number;
    outstandingCents: number;

    score: number;

    strength:
      | "strong"
      | "possible"
      | "weak";

    reason: string;
  };
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

      const [
        accountsResult,
        transactionsResult,
        matchesResult,
      ] = await Promise.all([
        client.rpc(
          "get_bank_accounts",
          {
            p_organization_id:
              organizationId,
          },
        ),

        client.rpc(
          "get_bank_transactions",
          {
            p_organization_id:
              organizationId,

            p_limit: 100,
          },
        ),

        client.rpc(
          "get_bank_match_suggestions",
          {
            p_organization_id:
              organizationId,

            p_limit: 100,
          },
        ),
      ]);

      if (accountsResult.error) {
        console.error(
          "get_bank_accounts failed",
          accountsResult.error,
        );

        return Response.json(
          {
            error:
              "Bankrekeningen kunnen tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      if (
        transactionsResult.error
      ) {
        console.error(
          "get_bank_transactions failed",
          transactionsResult.error,
        );

        return Response.json(
          {
            error:
              "Banktransacties kunnen tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      if (matchesResult.error) {
        console.error(
          "get_bank_match_suggestions failed",
          matchesResult.error,
        );

        return Response.json(
          {
            error:
              "Matchvoorstellen kunnen tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json({
        accounts:
          accountsResult.data as
            BankAccount[],

        transactions:
          transactionsResult.data as
            BankTransactionsResponse,

        matches:
          matchesResult.data as
            MatchSuggestion[],
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

      const body =
        await readBody(request);

      const organizationId =
        requireOrganization(
          identity,
          body.organizationId,
        );

      const transactionId =
        body.transactionId;

      const invoiceId =
        body.invoiceId;

      const invoiceType =
        body.invoiceType;

      if (
        typeof transactionId !==
          "string" ||
        !uuidPattern.test(
          transactionId,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldige banktransactie.",
        );
      }

      if (
        typeof invoiceId !==
          "string" ||
        !uuidPattern.test(
          invoiceId,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldige factuur.",
        );
      }

      if (
        invoiceType !== "sales" &&
        invoiceType !== "purchase"
      ) {
        throw new AccessError(
          400,
          "Ongeldig factuurtype.",
        );
      }

      const {
        data,
        error,
      } = await client.rpc(
        "confirm_bank_match",
        {
          p_organization_id:
            organizationId,

          p_transaction_id:
            transactionId,

          p_invoice_id:
            invoiceId,

          p_invoice_type:
            invoiceType,
        },
      );

      if (error) {
        console.error(
          "confirm_bank_match failed",
          {
            code: error.code,
            message: error.message,
          },
        );

        if (
          error.message.includes(
            "Office-gebruiker",
          )
        ) {
          return Response.json(
            {
              error:
                "Deze boeking kan alleen door een bevoegde medewerker worden bevestigd.",
            },
            {
              status: 403,
            },
          );
        }

        if (
          error.message.includes(
            "al gekoppeld",
          ) ||
          error.message.includes(
            "openstaand",
          ) ||
          error.message.includes(
            "groter dan",
          ) ||
          error.message.includes(
            "Alleen geboekte",
          )
        ) {
          return Response.json(
            {
              error:
                "De match kan niet meer worden bevestigd. Vernieuw de bankgegevens en controleer de factuur opnieuw.",
            },
            {
              status: 409,
            },
          );
        }

        return Response.json(
          {
            error:
              "De bankmatch kon niet worden verwerkt.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json({
        result: data,
      });
    },
  );
}