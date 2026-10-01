import {
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
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

      if (transactionsResult.error) {
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
              "De verwerkingsstatus kan tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json({
        accounts:
          accountsResult.data as BankAccount[],

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
