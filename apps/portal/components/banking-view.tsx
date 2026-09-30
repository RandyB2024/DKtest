"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  Landmark,
  Link2,
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
};

type Props = {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo: (view: string) => void;
};

const euro = new Intl.NumberFormat(
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

function statusLabel(
  status: string,
) {
  if (status === "matched") {
    return "Gekoppeld";
  }

  if (
    status === "suggested"
  ) {
    return "Voorstel";
  }

  if (
    status === "ignored"
  ) {
    return "Genegeerd";
  }

  return "Niet gekoppeld";
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

  const [query, setQuery] =
    useState("");

  const [filter, setFilter] =
    useState<
      | "all"
      | "unmatched"
      | "suggested"
      | "matched"
    >("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (
        context.organizationId ===
        "all"
      ) {
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

        if (!cancelled) {
          setData(
            result as BankResponse,
          );
        }
      } catch (
        caughtError
      ) {
        if (!cancelled) {
          setData(null);

          setError(
            caughtError instanceof
              Error
              ? caughtError.message
              : "Bankgegevens konden niet worden geladen.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    context.organizationId,
  ]);

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
          if (
            filter !== "all" &&
            item.reconciliationStatus !==
              filter
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
                .includes(search),
            );
        },
      );
    }, [
      data,
      filter,
      query,
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
            Bankrekeningen en
            transacties van{" "}
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
                  {
                    data
                      .transactions
                      .summary.count
                  }
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
                    data
                      .transactions
                      .summary
                      .unmatchedCount
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
                    data
                      .transactions
                      .summary
                      .suggestedCount
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
                    data
                      .transactions
                      .summary
                      .matchedCount
                  }
                </strong>

                <span>
                  Verwerkt
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
                    Inkomende en
                    uitgaande
                    transacties en
                    hun
                    verwerkingsstatus.
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
                      event
                        .target
                        .value as
                        | "all"
                        | "unmatched"
                        | "suggested"
                        | "matched",
                    )
                  }
                >
                  <option value="all">
                    Alle
                    transacties
                  </option>

                  <option value="unmatched">
                    Niet
                    gekoppeld
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
                    Er zijn nog geen
                    transacties voor
                    deze onderneming.
                  </p>
                </div>
              ) : (
                <div className="bank-transaction-list">
                  {visibleTransactions.map(
                    (
                      item,
                    ) => {
                      const incoming =
                        item.amountCents >
                        0;

                      return (
                        <article
                          className="bank-transaction"
                          key={
                            item.id
                          }
                        >
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

                          <div className="bank-match-state">
                            {item.reconciliationStatus ===
                              "matched" && (
                              <CheckCircle2 />
                            )}

                            {item.reconciliationStatus ===
                              "suggested" && (
                              <Sparkles />
                            )}

                            {item.reconciliationStatus ===
                              "unmatched" && (
                              <CircleAlert />
                            )}

                            <span>
                              {statusLabel(
                                item.reconciliationStatus,
                              )}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="btn"
                            disabled={
                              item.reconciliationStatus ===
                              "matched"
                            }
                          >
                            <Link2
                              size={
                                15
                              }
                            />

                            {item.reconciliationStatus ===
                            "suggested"
                              ? "Controleer"
                              : item.reconciliationStatus ===
                                  "matched"
                                ? "Gekoppeld"
                                : "Koppelen"}
                          </button>
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
                    Automatische
                    matching
                  </h2>

                  <p>
                    De volgende stap
                    koppelt
                    transacties aan
                    facturen.
                  </p>
                </div>

                <Building2 />
              </div>

              <div className="notice">
                Eerst wordt gematcht
                op factuurnummer,
                betalingsreferentie,
                bedrag en
                tegenpartij. Een
                voorstel wordt pas
                definitief nadat de
                boekhoudlogica dit
                veilig toestaat.
              </div>
            </section>
          </>
        )}
    </>
  );
}