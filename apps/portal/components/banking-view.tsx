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
  Clock3,
  Landmark,
  Search,
  UploadCloud,
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

  suggestion: null | {
    invoiceId: string;
    invoiceType:
      | "sales"
      | "purchase";
    invoiceNumber: string;
    relationName: string;
    score: number;
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

type CustomerStatus =
  | "matched"
  | "processing"
  | "missing_document";

type Filter =
  | "all"
  | CustomerStatus;

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

export default function BankingView({
  context,
  organization,
  onGo,
}: Props) {
  const [
    data,
    setData,
  ] =
    useState<BankResponse | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    filter,
    setFilter,
  ] =
    useState<Filter>(
      "all",
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
            "Selecteer eerst ??n onderneming om banktransacties te bekijken.",
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
                cache:
                  "no-store",
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

  function customerStatus(
    transaction:
      BankTransaction,
  ): CustomerStatus {
    if (
      transaction
        .reconciliationStatus ===
        "matched" ||
      transaction.paymentId
    ) {
      return "matched";
    }

    const match =
      matchMap.get(
        transaction.id,
      );

    if (
      match?.suggestion
    ) {
      return "processing";
    }

    /*
     * Uitgaande betaling zonder gevonden inkoopfactuur:
     * klant kan de ontbrekende factuur/bon aanleveren.
     *
     * Inkomende betaling zonder definitieve match:
     * administratie verwerkt deze verder.
     */
    if (
      transaction.amountCents < 0
    ) {
      return "missing_document";
    }

    return "processing";
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
          const status =
            customerStatus(
              item,
            );

          if (
            filter !== "all" &&
            status !== filter
          ) {
            return false;
          }

          if (!search) {
            return true;
          }

          return [
            item.counterpartyName,
            item.counterpartyIban,
            item.description,
            item.reference,
          ]
            .filter(Boolean)
            .some((value) =>
              value!
                .toLowerCase()
                .includes(
                  search,
                ),
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
      let matched = 0;
      let processing = 0;
      let missingDocument = 0;

      for (
        const transaction of
        data?.transactions.items ??
        []
      ) {
        const status =
          customerStatus(
            transaction,
          );

        if (
          status === "matched"
        ) {
          matched += 1;
        } else if (
          status ===
          "missing_document"
        ) {
          missingDocument += 1;
        } else {
          processing += 1;
        }
      }

      return {
        total:
          data?.transactions.items
            .length ?? 0,
        matched,
        processing,
        missingDocument,
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
              onGo(
                "Dashboard",
              )
            }
          >
            <ArrowLeft />
            Terug naar dashboard
          </button>

          <h1>
            Bankieren
          </h1>

          <p>
            Bekijk bankmutaties en
            de verwerkingsstatus
            van {companyName}.
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
                      gekoppeld,
                      verschijnen de
                      transacties hier.
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
                  Bankmutaties
                </label>

                <strong>
                  {
                    summary.total
                  }
                </strong>

                <span>
                  In overzicht
                </span>
              </article>

              <article className="card metric">
                <label>
                  Actie nodig
                </label>

                <strong>
                  {
                    summary.missingDocument
                  }
                </strong>

                <span>
                  Factuur of bon
                  ontbreekt
                </span>
              </article>

              <article className="card metric">
                <label>
                  Wordt verwerkt
                </label>

                <strong>
                  {
                    summary.processing
                  }
                </strong>

                <span>
                  Bij administratie
                </span>
              </article>

              <article className="card metric">
                <label>
                  Gekoppeld
                </label>

                <strong>
                  {
                    summary.matched
                  }
                </strong>

                <span>
                  Administratief
                  verwerkt
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
                    De administratie
                    controleert en
                    koppelt betalingen.
                    U ziet hier de
                    actuele status.
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
                        event.target
                          .value,
                      )
                    }
                    placeholder="Zoek naam, IBAN, omschrijving of referentie"
                  />
                </label>

                <select
                  value={
                    filter
                  }
                  onChange={(
                    event,
                  ) =>
                    setFilter(
                      event.target
                        .value as Filter,
                    )
                  }
                >
                  <option value="all">
                    Alle transacties
                  </option>

                  <option value="missing_document">
                    Actie nodig
                  </option>

                  <option value="processing">
                    Wordt verwerkt
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

                      const status =
                        customerStatus(
                          item,
                        );

                      return (
                        <article
                          className="bank-transaction-card"
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
                                {" ? "}
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
                              className={`bank-match-state ${status}`}
                            >
                              {status ===
                                "matched" && (
                                <CheckCircle2 />
                              )}

                              {status ===
                                "processing" && (
                                <Clock3 />
                              )}

                              {status ===
                                "missing_document" && (
                                <CircleAlert />
                              )}

                              <span>
                                {status ===
                                "matched"
                                  ? "Gekoppeld"
                                  : status ===
                                      "missing_document"
                                    ? "Factuur/bon ontbreekt"
                                    : "Wordt verwerkt"}
                              </span>
                            </div>

                            {status ===
                            "missing_document" ? (
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  onGo(
                                    "Documenten",
                                  )
                                }
                              >
                                <UploadCloud
                                  size={
                                    15
                                  }
                                />
                                Factuur/bon uploaden
                              </button>
                            ) : (
                              <span className="bank-customer-readonly">
                                {status ===
                                "matched"
                                  ? "Afgerond"
                                  : "Geen actie nodig"}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    },
                  )}
                </div>
              )}
            </section>

            <section className="card bank-customer-info">
              <div className="section-heading">
                <div>
                  <h2>
                    Wie doet wat?
                  </h2>

                  <p>
                    U levert documenten
                    aan. De administratie
                    controleert de
                    boekhouding en maakt
                    de definitieve
                    koppeling.
                  </p>
                </div>

                <CheckCircle2 />
              </div>
            </section>
          </>
        )}
    </>
  );
}
