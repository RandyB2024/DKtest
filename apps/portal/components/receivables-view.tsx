"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileText,
  Search,
  WalletCards,
} from "lucide-react";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";

import DebtorManager from "./debtor-manager";
import InvoiceDraftManager from "./invoice-draft-manager";
import InvoiceArchive from "./invoice-archive";
import InvoiceProfileManager from "./invoice-profile-manager";

type ReceivableItem = {
  id: string;

  invoiceNumber: string;

  invoiceDate: string;

  dueDate: string;

  status: string;

  debtor: {
    id: string;
    name: string;
  };

  currency: string;

  subtotalCents: number;

  vatCents: number;

  totalCents: number;

  paidCents: number;

  outstandingCents: number;

  overdue: boolean;
};

type ReceivablesResponse = {
  summary: {
    totalCents: number;
    overdueCents: number;
    count: number;
    overdueCount: number;
  };

  items: ReceivableItem[];
};

type ReceivablesViewProps = {
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
  new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function money(cents: number) {
  return euro.format(cents / 100);
}

function date(value: string) {
  return dateFormatter.format(
    new Date(
      `${value}T12:00:00`,
    ),
  );
}

export default function ReceivablesView({
  context,
  organization,
  onGo,
}: ReceivablesViewProps) {
  const [data, setData] =
    useState<ReceivablesResponse | null>(
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
      "all" | "overdue" | "open"
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
          "Selecteer eerst één onderneming om de debiteuren te bekijken.",
        );

        return;
      }

      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `/api/financial/receivables?organizationId=${encodeURIComponent(
              context.organizationId,
            )}`,
            {
              cache: "no-store",
            },
          );

        const result =
          (await response.json()) as
            | ReceivablesResponse
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in result &&
              result.error
              ? result.error
              : "Debiteuren konden niet worden geladen.",
          );
        }

        if (!cancelled) {
          setData(
            result as ReceivablesResponse,
          );
        }
      } catch (caughtError) {
        if (!cancelled) {
          setData(null);

          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Debiteuren konden niet worden geladen.",
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
  }, [context.organizationId]);

  const visibleItems = useMemo(
    () => {
      if (!data) {
        return [];
      }

      const search =
        query
          .trim()
          .toLowerCase();

      return data.items.filter(
        (item) => {
          if (
            filter === "overdue" &&
            !item.overdue
          ) {
            return false;
          }

          if (
            filter === "open" &&
            item.overdue
          ) {
            return false;
          }

          if (!search) {
            return true;
          }

          return (
            item.debtor.name
              .toLowerCase()
              .includes(search) ||
            item.invoiceNumber
              .toLowerCase()
              .includes(search)
          );
        },
      );
    },
    [data, query, filter],
  );

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

          <h1>Debiteuren</h1>

          <p>
            Openstaande verkoopfacturen
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
            Debiteuren worden
            geladen...
          </p>
        </section>
      )}

      {!loading && data && (
        <>
          <section className="grid metrics">
            <article className="card metric">
              <label>
                Openstaand
              </label>

              <strong>
                {money(
                  data.summary
                    .totalCents,
                )}
              </strong>

              <span>
                {
                  data.summary
                    .count
                }{" "}
                factuur
                {data.summary
                  .count === 1
                  ? ""
                  : "en"}
              </span>
            </article>

            <article className="card metric">
              <label>
                Vervallen
              </label>

              <strong>
                {money(
                  data.summary
                    .overdueCents,
                )}
              </strong>

              <span>
                {
                  data.summary
                    .overdueCount
                }{" "}
                vervallen
              </span>
            </article>

            <article className="card metric">
              <label>
                Niet vervallen
              </label>

              <strong>
                {money(
                  data.summary
                    .totalCents -
                    data.summary
                      .overdueCents,
                )}
              </strong>

              <span>
                Nog binnen
                betaaltermijn
              </span>
            </article>
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <h2>
                  Openstaande
                  facturen
                </h2>

                <p>
                  Bekijk waar het
                  debiteurensaldo uit
                  bestaat.
                </p>
              </div>
            </div>

            <div className="invoice-filters">
              <label>
                <Search size={16} />

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Zoek klant of factuurnummer"
                />
              </label>

              <select
                value={filter}
                onChange={(event) =>
                  setFilter(
                    event.target
                      .value as
                      | "all"
                      | "overdue"
                      | "open",
                  )
                }
              >
                <option value="all">
                  Alle openstaande
                </option>

                <option value="overdue">
                  Alleen vervallen
                </option>

                <option value="open">
                  Binnen
                  betaaltermijn
                </option>
              </select>
            </div>

            {visibleItems.length ===
            0 ? (
              <div className="notice">
                Geen openstaande
                facturen gevonden.
              </div>
            ) : (
              <div className="invoice-cards">
                {visibleItems.map(
                  (item) => (
                    <article
                      className="invoice-card"
                      key={item.id}
                    >
                      <div>
                        <small>
                          {
                            item.invoiceNumber
                          }
                        </small>

                        <h2>
                          {
                            item.debtor
                              .name
                          }
                        </h2>

                        <span>
                          Factuur{" "}
                          {date(
                            item.invoiceDate,
                          )}
                          {" · "}
                          vervalt{" "}
                          {date(
                            item.dueDate,
                          )}
                        </span>
                      </div>

                      <div>
                        <strong>
                          {money(
                            item
                              .outstandingCents,
                          )}
                        </strong>

                        <small>
                          Van{" "}
                          {money(
                            item
                              .totalCents,
                          )}
                        </small>
                      </div>

                      <span
                        className={`status ${
                          item.overdue
                            ? "bad"
                            : "warn"
                        }`}
                      >
                        {item.overdue
                          ? "Vervallen"
                          : "Openstaand"}
                      </span>

                      <div className="invoice-actions">
                        <button
  type="button"
  className="btn"
  onClick={() => {
    sessionStorage.setItem(
      "customer-receivable-detail",
      JSON.stringify(item),
    );

    onGo("Factuurdetail");
  }}
>
  <FileText size={15} />

  Bekijk factuur

  <ArrowRight size={15} />
</button>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>

          <InvoiceProfileManager
            context={context}
          />

          <InvoiceDraftManager
            context={context}
          />

          <InvoiceArchive
            context={context}
            title="Openstaande facturen"
            description="Openstaande, gedeeltelijk betaalde en vervallen verkoopfacturen."
          />

          <DebtorManager
            context={context}
          />

          <section className="grid">
            <article className="card">
              <div className="section-heading">
                <div>
                  <h2>
                    Betaalstatus
                  </h2>

                  <p>
                    Samenvatting van de
                    openstaande
                    verkoopfacturen.
                  </p>
                </div>

                <WalletCards />
              </div>

              <p>
                <CheckCircle2
                  size={16}
                />{" "}
                Openstaand totaal:{" "}
                <strong>
                  {money(
                    data.summary
                      .totalCents,
                  )}
                </strong>
              </p>

              <p>
                <CircleAlert
                  size={16}
                />{" "}
                Daarvan vervallen:{" "}
                <strong>
                  {money(
                    data.summary
                      .overdueCents,
                  )}
                </strong>
              </p>

              <p>
                <CalendarDays
                  size={16}
                />{" "}
                {
                  data.summary
                    .count
                }{" "}
                openstaande factuur
                {data.summary
                  .count === 1
                  ? ""
                  : "en"}
              </p>
            </article>
          </section>
        </>
      )}
    </>
  );
}