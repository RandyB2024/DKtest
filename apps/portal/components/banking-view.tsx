"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  Landmark,
  Link2,
  LoaderCircle,
  Search,
  Sparkles,
  WalletCards,
} from "lucide-react";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";

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

type BankResponse = {
  accounts: BankAccount[];

  transactions: {
    summary: {
      count: number;
      unmatchedCount: number;
      suggestedCount: number;
      matchedCount: number;
    };

    items: BankTransaction[];
  };

  matches: MatchSuggestion[];
};

type Props = {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo: (view: string) => void;
};

type Filter =
  | "all"
  | "unmatched"
  | "suggested"
  | "matched";

const euro =
  new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
    },
  );

const dateFormatter =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

function money(
  cents: number,
) {
  return euro.format(
    cents / 100,
  );
}

function date(
  value: string,
) {
  return dateFormatter.format(
    new Date(value),
  );
}

function matchStrengthLabel(
  strength:
    | "strong"
    | "possible"
    | "weak",
) {
  if (
    strength === "strong"
  ) {
    return "Sterke match";
  }

  if (
    strength === "possible"
  ) {
    return "Mogelijke match";
  }

  return "Zwakke match";
}

export default function BankingView({
  context,
  organization,
  onGo,
}: Props) {
  const [data, setData] =
    useState<BankResponse | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [query, setQuery] =
    useState("");

  const [filter, setFilter] =
    useState<Filter>("all");

  const [
    expandedTransaction,
    setExpandedTransaction,
  ] =
    useState<string | null>(
      null,
    );

  const [
    confirmingTransaction,
    setConfirmingTransaction,
  ] =
    useState<string | null>(
      null,
    );

  const load =
    useCallback(
      async () => {
        if (
          context.organizationId ===
          "all"
        ) {
          setData(null);
          setLoading(false);

          setError(
            "Selecteer eerst één onderneming om banktransacties te bekijken.",
          );

          return;
        }

        setLoading(true);
        setError("");

        try {
          const response =
            await fetch(
              `/api/financial/bank?organizationId=${encodeURIComponent(
                context.organizationId,
              )}`,
              {
                cache: "no-store",
              },
            );

          const result =
            (await response.json()) as
              | BankResponse
              | {
                  error?: string;
                };

          if (!response.ok) {
            throw new Error(
              "error" in result &&
                result.error
                ? result.error
                : "Bankgegevens konden niet worden geladen.",
            );
          }

          setData(
            result as BankResponse,
          );
        } catch (
          caughtError
        ) {
          setData(null);

          setError(
            caughtError instanceof
              Error
              ? caughtError.message
              : "Bankgegevens konden niet worden geladen.",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        context.organizationId,
      ],
    );

  useEffect(() => {
    void load();
  }, [load]);

  const matchMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          MatchSuggestion
        >();

      for (
        const match of
        data?.matches ?? []
      ) {
        map.set(
          match.transactionId,
          match,
        );
      }

      return map;
    }, [data]);

  function getEffectiveStatus(
    transaction:
      BankTransaction,
  ): Filter {
    if (
      transaction
        .reconciliationStatus ===
      "matched"
    ) {
      return "matched";
    }

    const match =
      matchMap.get(
        transaction.id,
      );

    if (match?.suggestion) {
      return "suggested";
    }

    return "unmatched";
  }

  async function confirmMatch(
    transaction:
      BankTransaction,
    match:
      MatchSuggestion,
  ) {
    if (
      context.organizationId ===
      "all"
    ) {
      return;
    }

    if (!match.suggestion) {
      return;
    }

    setConfirmingTransaction(
      transaction.id,
    );

    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/financial/bank",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body: JSON.stringify({
              organizationId:
                context.organizationId,

              transactionId:
                transaction.id,

              invoiceId:
                match.suggestion
                  .invoiceId,

              invoiceType:
                match.suggestion
                  .invoiceType,
            }),
          },
        );

      const result =
        (await response.json()) as {
          error?: string;

          result?: {
            invoiceNumber?:
              string;
          };
        };

      if (!response.ok) {
        throw new Error(
          result.error ||
            "De match kon niet worden bevestigd.",
        );
      }

      setSuccess(
        result.result
          ?.invoiceNumber
          ? `Banktransactie is gekoppeld aan factuur ${result.result.invoiceNumber}.`
          : "Banktransactie is succesvol gekoppeld.",
      );

      setExpandedTransaction(
        null,
      );

      await load();
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "De match kon niet worden bevestigd.",
      );
    } finally {
      setConfirmingTransaction(
        null,
      );
    }
  }

  const visibleTransactions =
    useMemo(() => {
      if (!data) {
        return [];
      }

      const search =
        query
          .trim()
          .toLowerCase();

      return data.transactions.items.filter(
        (item) => {
          const effectiveStatus =
            getEffectiveStatus(
              item,
            );

          if (
            filter !== "all" &&
            effectiveStatus !==
              filter
          ) {
            return false;
          }

          if (!search) {
            return true;
          }

          const match =
            matchMap.get(
              item.id,
            );

          return [
            item.counterpartyName,
            item.counterpartyIban,
            item.description,
            item.reference,
            match?.suggestion
              ?.invoiceNumber,
            match?.suggestion
              ?.relationName,
          ]
            .filter(Boolean)
            .some((value) =>
              value!
                .toLowerCase()
                .includes(search),
            );
        },
      );
    }, [
      data,
      filter,
      query,
      matchMap,
    ]);

  const summary =
    useMemo(() => {
      if (!data) {
        return {
          count: 0,
          unmatchedCount: 0,
          suggestedCount: 0,
          matchedCount: 0,
        };
      }

      let unmatchedCount = 0;
      let suggestedCount = 0;
      let matchedCount = 0;

      for (
        const transaction of
        data.transactions.items
      ) {
        const status =
          getEffectiveStatus(
            transaction,
          );

        if (
          status === "matched"
        ) {
          matchedCount += 1;
        } else if (
          status === "suggested"
        ) {
          suggestedCount += 1;
        } else {
          unmatchedCount += 1;
        }
      }

      return {
        count:
          data.transactions.items
            .length,

        unmatchedCount,
        suggestedCount,
        matchedCount,
      };
    }, [
      data,
      matchMap,
    ]);

  const companyName =
    organization?.name ??
    "Uw onderneming";

  return (
    <>
      <div className="heading">
        <div>
          <button
            type="button"
            className="customer-text-link"
            onClick={() =>
              onGo("Dashboard")
            }
          >
            <ArrowLeft />
            Terug naar dashboard
          </button>

          <h1>Bankieren</h1>

          <p>
            Bankrekeningen,
            transacties en
            factuurmatching van{" "}
            {companyName}.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="notice"
          role="status"
        >
          <CheckCircle2
            size={16}
          />{" "}
          {success}
        </div>
      )}

      {loading && (
        <section className="card">
          <p>
            Bankgegevens worden
            geladen...
          </p>
        </section>
      )}

      {!loading &&
        data && (
          <>
            <section className="bank-account-grid">
              {data.accounts.length ===
              0 ? (
                <article className="card bank-empty-account">
                  <Landmark />

                  <div>
                    <h2>
                      Nog geen
                      bankrekening
                      gekoppeld
                    </h2>

                    <p>
                      Zodra een
                      bankrekening is
                      gekoppeld, worden
                      transacties hier
                      automatisch
                      weergegeven.
                    </p>
                  </div>
                </article>
              ) : (
                data.accounts.map(
                  (account) => (
                    <article
                      className="card bank-account-card"
                      key={
                        account.id
                      }
                    >
                      <div className="bank-account-icon">
                        <Landmark />
                      </div>

                      <div>
                        <small>
                          Bankrekening
                        </small>

                        <h2>
                          {
                            account.accountName
                          }
                        </h2>

                        <p>
                          {account.iban ||
                            "IBAN niet beschikbaar"}
                        </p>
                      </div>

                      <span className="status ok">
                        Actief
                      </span>
                    </article>
                  ),
                )
              )}
            </section>

            <section className="grid metrics">
              <article className="card metric">
                <label>
                  Transacties
                </label>

                <strong>
                  {summary.count}
                </strong>

                <span>
                  In huidige
                  transactieset
                </span>
              </article>

              <article className="card metric">
                <label>
                  Niet gekoppeld
                </label>

                <strong>
                  {
                    summary.unmatchedCount
                  }
                </strong>

                <span>
                  Vereist nog
                  verwerking
                </span>
              </article>

              <article className="card metric">
                <label>
                  Matchvoorstellen
                </label>

                <strong>
                  {
                    summary.suggestedCount
                  }
                </strong>

                <span>
                  Te controleren
                </span>
              </article>

              <article className="card metric">
                <label>
                  Gekoppeld
                </label>

                <strong>
                  {
                    summary.matchedCount
                  }
                </strong>

                <span>
                  Definitief verwerkt
                </span>
              </article>
            </section>

            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>
                    Banktransacties
                  </h2>

                  <p>
                    Controleer welke
                    transacties al
                    gekoppeld zijn en
                    welke een
                    factuurvoorstel
                    hebben.
                  </p>
                </div>

                <WalletCards />
              </div>

              <div className="invoice-filters">
                <label>
                  <Search
                    size={16}
                  />

                  <input
                    value={
                      query
                    }
                    onChange={(
                      event,
                    ) =>
                      setQuery(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Zoek naam, IBAN, factuurnummer, omschrijving of referentie"
                  />
                </label>

                <select
                  value={filter}
                  onChange={(
                    event,
                  ) =>
                    setFilter(
                      event
                        .target
                        .value as Filter,
                    )
                  }
                >
                  <option value="all">
                    Alle transacties
                  </option>

                  <option value="unmatched">
                    Niet gekoppeld
                  </option>

                  <option value="suggested">
                    Matchvoorstel
                  </option>

                  <option value="matched">
                    Gekoppeld
                  </option>
                </select>
              </div>

              {visibleTransactions.length ===
              0 ? (
                <div className="bank-empty">
                  <WalletCards />

                  <h3>
                    Geen
                    banktransacties
                  </h3>

                  <p>
                    Er zijn geen
                    transacties die
                    aan het huidige
                    filter voldoen.
                  </p>
                </div>
              ) : (
                <div className="bank-transaction-list">
                  {visibleTransactions.map(
                    (item) => {
                      const incoming =
                        item.amountCents >
                        0;

                      const effectiveStatus =
                        getEffectiveStatus(
                          item,
                        );

                      const match =
                        matchMap.get(
                          item.id,
                        );

                      const suggestion =
                        match?.suggestion ??
                        null;

                      const expanded =
                        expandedTransaction ===
                        item.id;

                      const confirming =
                        confirmingTransaction ===
                        item.id;

                      return (
                        <article
                          className={`bank-transaction-card ${
                            expanded
                              ? "expanded"
                              : ""
                          }`}
                          key={
                            item.id
                          }
                        >
                          <div className="bank-transaction">
                            <div
                              className={`bank-direction ${
                                incoming
                                  ? "incoming"
                                  : "outgoing"
                              }`}
                            >
                              {incoming ? (
                                <ArrowDownLeft />
                              ) : (
                                <ArrowUpRight />
                              )}
                            </div>

                            <div className="bank-transaction-main">
                              <strong>
                                {item.counterpartyName ||
                                  "Onbekende tegenpartij"}
                              </strong>

                              <span>
                                {item.description ||
                                  item.reference ||
                                  "Geen omschrijving"}
                              </span>

                              <small>
                                {date(
                                  item.bookedAt,
                                )}
                                {" · "}
                                {
                                  item
                                    .bankAccount
                                    .name
                                }
                              </small>
                            </div>

                            <div className="bank-transaction-amount">
                              <strong
                                className={
                                  incoming
                                    ? "positive"
                                    : ""
                                }
                              >
                                {money(
                                  item.amountCents,
                                )}
                              </strong>

                              {item.counterpartyIban && (
                                <small>
                                  {
                                    item.counterpartyIban
                                  }
                                </small>
                              )}
                            </div>

                            <div
                              className={`bank-match-state ${effectiveStatus}`}
                            >
                              {effectiveStatus ===
                                "matched" && (
                                <CheckCircle2 />
                              )}

                              {effectiveStatus ===
                                "suggested" && (
                                <Sparkles />
                              )}

                              {effectiveStatus ===
                                "unmatched" && (
                                <CircleAlert />
                              )}

                              <span>
                                {effectiveStatus ===
                                "matched"
                                  ? "Gekoppeld"
                                  : effectiveStatus ===
                                      "suggested"
                                    ? "Voorstel"
                                    : "Niet gekoppeld"}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="btn"
                              disabled={
                                effectiveStatus ===
                                  "matched" ||
                                confirming
                              }
                              onClick={() =>
                                setExpandedTransaction(
                                  expanded
                                    ? null
                                    : item.id,
                                )
                              }
                            >
                              {effectiveStatus ===
                              "suggested" ? (
                                <Sparkles
                                  size={
                                    15
                                  }
                                />
                              ) : (
                                <Link2
                                  size={
                                    15
                                  }
                                />
                              )}

                              {effectiveStatus ===
                              "suggested"
                                ? "Controleer"
                                : effectiveStatus ===
                                    "matched"
                                  ? "Gekoppeld"
                                  : "Koppelen"}
                            </button>
                          </div>

                          {expanded && (
                            <div className="bank-match-panel">
                              {suggestion &&
                              match ? (
                                <>
                                  <div className="bank-match-panel-heading">
                                    <div>
                                      <span>
                                        Automatisch
                                        matchvoorstel
                                      </span>

                                      <h3>
                                        {matchStrengthLabel(
                                          suggestion.strength,
                                        )}
                                      </h3>
                                    </div>

                                    <strong>
                                      {
                                        suggestion.score
                                      }
                                      /100
                                    </strong>
                                  </div>

                                  <div className="bank-match-details">
                                    <div>
                                      <span>
                                        Type
                                      </span>

                                      <strong>
                                        {suggestion.invoiceType ===
                                        "sales"
                                          ? "Verkoopfactuur"
                                          : "Inkoopfactuur"}
                                      </strong>
                                    </div>

                                    <div>
                                      <span>
                                        Factuurnummer
                                      </span>

                                      <strong>
                                        {
                                          suggestion.invoiceNumber
                                        }
                                      </strong>
                                    </div>

                                    <div>
                                      <span>
                                        Relatie
                                      </span>

                                      <strong>
                                        {
                                          suggestion.relationName
                                        }
                                      </strong>
                                    </div>

                                    <div>
                                      <span>
                                        Openstaand
                                      </span>

                                      <strong>
                                        {money(
                                          suggestion.outstandingCents,
                                        )}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="bank-match-reason">
                                    <FileCheck2 />

                                    <span>
                                      {
                                        suggestion.reason
                                      }
                                    </span>
                                  </div>

                                  <div className="notice">
                                    Controleer de
                                    factuur zorgvuldig.
                                    Na bevestigen wordt
                                    deze bankmutatie
                                    definitief als
                                    betaling geboekt.
                                  </div>

                                  <div className="bank-match-actions">
                                    <button
                                      type="button"
                                      className="btn"
                                      disabled={
                                        confirming
                                      }
                                      onClick={() =>
                                        confirmMatch(
                                          item,
                                          match,
                                        )
                                      }
                                    >
                                      {confirming ? (
                                        <LoaderCircle
                                          size={
                                            15
                                          }
                                        />
                                      ) : (
                                        <CheckCircle2
                                          size={
                                            15
                                          }
                                        />
                                      )}

                                      {confirming
                                        ? "Verwerken..."
                                        : "Match bevestigen"}
                                    </button>

                                    <small>
                                      Bedrag:{" "}
                                      {money(
                                        Math.abs(
                                          item.amountCents,
                                        ),
                                      )}
                                    </small>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="bank-match-panel-heading">
                                    <div>
                                      <span>
                                        Automatische
                                        matching
                                      </span>

                                      <h3>
                                        Geen geschikte
                                        factuur gevonden
                                      </h3>
                                    </div>

                                    <CircleAlert />
                                  </div>

                                  <p className="bank-match-no-result">
                                    Het systeem vond
                                    geen voldoende
                                    passende openstaande
                                    factuur op basis van
                                    bedrag, referentie
                                    en tegenpartij.
                                  </p>

                                  <div className="notice">
                                    Deze transactie
                                    blijft ongekoppeld.
                                    Handmatige
                                    grootboekverwerking
                                    bouwen we later in
                                    de Office-omgeving.
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    },
                  )}
                </div>
              )}
            </section>

            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>
                    Matchingregels
                  </h2>

                  <p>
                    Matchvoorstellen
                    worden eerst met
                    controleerbare regels
                    bepaald.
                  </p>
                </div>

                <FileCheck2 />
              </div>

              <div className="bank-matching-rules">
                <div>
                  <strong>
                    100 punten
                  </strong>

                  <span>
                    Bedrag én
                    factuurnummer of
                    betalingsreferentie
                    komen overeen.
                  </span>
                </div>

                <div>
                  <strong>
                    90 punten
                  </strong>

                  <span>
                    Bedrag én
                    tegenpartij komen
                    overeen.
                  </span>
                </div>

                <div>
                  <strong>
                    75 punten
                  </strong>

                  <span>
                    Het openstaande
                    bedrag komt exact
                    overeen.
                  </span>
                </div>

                <div>
                  <strong>
                    50 punten
                  </strong>

                  <span>
                    Er is alleen een
                    gedeeltelijke
                    referentiematch.
                  </span>
                </div>
              </div>
            </section>
          </>
        )}
    </>
  );
}