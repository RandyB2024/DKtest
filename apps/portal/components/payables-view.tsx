"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileQuestion,
  FileText,
  Landmark,
  Repeat2,
  Search,
  WalletCards,
} from "lucide-react";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";


type PayableItem = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;

  creditor: {
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
  dueSoon?: boolean;

  documentId: string | null;
  reference: string | null;
  description: string | null;
};


type Supplier = {
  id: string;
  name: string;
  email: string | null;
  iban: string | null;
  vatId: string | null;
  chamberOfCommerce: string | null;
  paymentTermDays: number;
  outstandingCents: number;
  openCount: number;
  oldestDueDate: string | null;
};


type ExpectedCost = {
  id: string;
  creditorId: string | null;
  name: string;
  description: string | null;

  frequency:
    | "monthly"
    | "quarterly"
    | "half_yearly"
    | "yearly"
    | "one_off";

  expectedAmountCents: number;

  tolerancePercent: number;

  nextExpectedDate: string;

  automaticDebit: boolean;

  ledgerAccount: string | null;
  vatCode: string | null;
  costCenter: string | null;

  contractEndDate: string | null;
  noticeDate: string | null;

  notes: string | null;
};


type MissingDocument = {
  id: string;
  creditorId: string | null;
  transactionReference: string | null;
  transactionDate: string;
  counterparty: string | null;
  description: string | null;
  amountCents: number;
  status: string;
  documentId: string | null;
  purchaseInvoiceId: string | null;
  requestedAt: string | null;
};


type PayablesResponse = {
  summary: {
    totalCents: number;
    overdueCents: number;
    due7Cents: number;
    due30Cents: number;

    count: number;
    overdueCount: number;
    partialCount: number;

    expectedCents: number;
    expected30Cents: number;
    expectedCount: number;

    missingDocumentCents: number;
    missingDocumentCount: number;
  };

  aging: {
    notDueCents: number;
    days1to30Cents: number;
    days31to60Cents: number;
    days61to90Cents: number;
    over90Cents: number;
  };

  items: PayableItem[];

  suppliers: Supplier[];

  expectedCosts: ExpectedCost[];

  missingDocuments: MissingDocument[];
};


type PayablesViewProps = {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo: (view: string) => void;
};


type Tab =
  | "overview"
  | "invoices"
  | "expected"
  | "missing"
  | "suppliers";


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
    Number(cents || 0) / 100,
  );
}


function date(
  value:
    | string
    | null,
) {
  if (!value) {
    return "—";
  }

  return dateFormatter.format(
    new Date(
      `${value}T12:00:00`,
    ),
  );
}


function frequencyLabel(
  value:
    ExpectedCost["frequency"],
) {
  switch (value) {
    case "monthly":
      return "Maandelijks";

    case "quarterly":
      return "Per kwartaal";

    case "half_yearly":
      return "Halfjaarlijks";

    case "yearly":
      return "Jaarlijks";

    default:
      return "Eenmalig";
  }
}


export default function PayablesView({
  context,
  organization,
  onGo,
}: PayablesViewProps) {
  const [
    data,
    setData,
  ] =
    useState<
      PayablesResponse | null
    >(null);

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
    useState<
      | "all"
      | "overdue"
      | "soon"
      | "partial"
    >("all");

  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      "overview",
    );


  useEffect(
    () => {
      let cancelled =
        false;

      async function load() {
        if (
          context.organizationId ===
          "all"
        ) {
          if (
            !cancelled
          ) {
            setLoading(
              false,
            );

            setError(
              "Selecteer eerst één onderneming om de crediteuren te bekijken.",
            );
          }

          return;
        }

        if (
          !cancelled
        ) {
          setLoading(
            true,
          );

          setError("");
        }

        try {
          const response =
            await fetch(
              `/api/financial/payables?organizationId=${encodeURIComponent(
                context.organizationId,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const result =
            (await response.json()) as
              | PayablesResponse
              | {
                  error?: string;
                };

          if (
            !response.ok
          ) {
            throw new Error(
              "error" in result &&
                result.error
                ? result.error
                : "Crediteuren konden niet worden geladen.",
            );
          }

          if (
            !cancelled
          ) {
            setData(
              result as PayablesResponse,
            );
          }
        } catch (
          caughtError
        ) {
          if (
            !cancelled
          ) {
            setData(
              null,
            );

            setError(
              caughtError
                instanceof Error
                ? caughtError.message
                : "Crediteuren konden niet worden geladen.",
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setLoading(
              false,
            );
          }
        }
      }

      void load();

      return () => {
        cancelled =
          true;
      };
    },
    [
      context.organizationId,
    ],
  );


  const visibleItems =
    useMemo(
      () => {
        if (!data) {
          return [];
        }

        const search =
          query
            .trim()
            .toLowerCase();

        return data.items.filter(
          (
            item,
          ) => {
            if (
              filter ===
                "overdue" &&
              !item.overdue
            ) {
              return false;
            }

            if (
              filter ===
                "soon" &&
              !item.dueSoon
            ) {
              return false;
            }

            if (
              filter ===
                "partial" &&
              item.paidCents <=
                0
            ) {
              return false;
            }

            if (
              !search
            ) {
              return true;
            }

            return (
              item.creditor.name
                .toLowerCase()
                .includes(
                  search,
                )
              ||
              item.invoiceNumber
                .toLowerCase()
                .includes(
                  search,
                )
            );
          },
        );
      },
      [
        data,
        query,
        filter,
      ],
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
              onGo(
                "Dashboard",
              )
            }
          >
            <ArrowLeft />
            Terug naar dashboard
          </button>

          <h1>
            Crediteuren
          </h1>

          <p>
            Alles wat{" "}
            {companyName}{" "}
            nog moet betalen,
            verwacht te betalen
            en nog moet
            aanleveren.
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
            Crediteuren worden
            geladen...
          </p>
        </section>
      )}


      {!loading &&
        data && (
          <>
            <section className="grid metrics">
              <article className="card metric">
                <label>
                  Nog te betalen
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
                  openstaande
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
                  te laat
                </span>
              </article>


              <article className="card metric">
                <label>
                  Binnen 7 dagen
                </label>

                <strong>
                  {money(
                    data.summary
                      .due7Cents,
                  )}
                </strong>

                <span>
                  Komt binnenkort
                  voor betaling
                </span>
              </article>


              <article className="card metric">
                <label>
                  Binnen 30 dagen
                </label>

                <strong>
                  {money(
                    data.summary
                      .due30Cents,
                  )}
                </strong>

                <span>
                  Geplande
                  betalingsdruk
                </span>
              </article>


              <article className="card metric">
                <label>
                  Verwachte kosten
                </label>

                <strong>
                  {money(
                    data.summary
                      .expected30Cents,
                  )}
                </strong>

                <span>
                  Komende 30 dagen
                </span>
              </article>


              <article className="card metric">
                <label>
                  Document ontbreekt
                </label>

                <strong>
                  {
                    data.summary
                      .missingDocumentCount
                  }
                </strong>

                <span>
                  {money(
                    data.summary
                      .missingDocumentCents,
                  )}
                  {" "}
                  zonder factuur
                  of bon
                </span>
              </article>
            </section>


            <nav
              className="invoice-filters"
              aria-label="Crediteurenonderdelen"
            >
              <button
                type="button"
                className={
                  tab ===
                  "overview"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setTab(
                    "overview",
                  )
                }
              >
                Overzicht
              </button>

              <button
                type="button"
                className={
                  tab ===
                  "invoices"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setTab(
                    "invoices",
                  )
                }
              >
                Openstaande facturen
              </button>

              <button
                type="button"
                className={
                  tab ===
                  "expected"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setTab(
                    "expected",
                  )
                }
              >
                Verwachte kosten
              </button>

              <button
                type="button"
                className={
                  tab ===
                  "missing"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setTab(
                    "missing",
                  )
                }
              >
                Ontbrekende documenten
              </button>

              <button
                type="button"
                className={
                  tab ===
                  "suppliers"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setTab(
                    "suppliers",
                  )
                }
              >
                Leveranciers
              </button>
            </nav>


            {tab ===
              "overview" && (
              <>
                <section className="grid">
                  <article className="card">
                    <div className="section-heading">
                      <div>
                        <h2>
                          Betalingsplanning
                        </h2>

                        <p>
                          Wat moet de komende
                          periode worden
                          betaald?
                        </p>
                      </div>

                      <CalendarClock />
                    </div>

                    <p>
                      <strong>
                        Vandaag / vervallen
                      </strong>
                      {" · "}
                      {money(
                        data.summary
                          .overdueCents,
                      )}
                    </p>

                    <p>
                      <strong>
                        Komende 7 dagen
                      </strong>
                      {" · "}
                      {money(
                        data.summary
                          .due7Cents,
                      )}
                    </p>

                    <p>
                      <strong>
                        Komende 30 dagen
                      </strong>
                      {" · "}
                      {money(
                        data.summary
                          .due30Cents,
                      )}
                    </p>

                    <p>
                      <strong>
                        Verwachte vaste kosten
                      </strong>
                      {" · "}
                      {money(
                        data.summary
                          .expected30Cents,
                      )}
                    </p>
                  </article>


                  <article className="card">
                    <div className="section-heading">
                      <div>
                        <h2>
                          Aandacht nodig
                        </h2>

                        <p>
                          Zaken die de
                          administratie
                          blokkeren of
                          aandacht vragen.
                        </p>
                      </div>

                      <CircleAlert />
                    </div>

                    <p>
                      {
                        data.summary
                          .overdueCount
                      }{" "}
                      vervallen
                      facturen
                    </p>

                    <p>
                      {
                        data.summary
                          .partialCount
                      }{" "}
                      gedeeltelijk
                      betaalde
                      facturen
                    </p>

                    <p>
                      {
                        data.summary
                          .missingDocumentCount
                      }{" "}
                      ontbrekende
                      facturen of
                      bonnetjes
                    </p>
                  </article>
                </section>


                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Crediteurenouderdom
                      </h2>

                      <p>
                        Hoe lang staan
                        betalingen al open?
                      </p>
                    </div>

                    <Clock3 />
                  </div>

                  <div className="grid metrics">
                    <article className="metric">
                      <label>
                        Binnen termijn
                      </label>

                      <strong>
                        {money(
                          data.aging
                            .notDueCents,
                        )}
                      </strong>
                    </article>

                    <article className="metric">
                      <label>
                        1–30 dagen
                      </label>

                      <strong>
                        {money(
                          data.aging
                            .days1to30Cents,
                        )}
                      </strong>
                    </article>

                    <article className="metric">
                      <label>
                        31–60 dagen
                      </label>

                      <strong>
                        {money(
                          data.aging
                            .days31to60Cents,
                        )}
                      </strong>
                    </article>

                    <article className="metric">
                      <label>
                        61–90 dagen
                      </label>

                      <strong>
                        {money(
                          data.aging
                            .days61to90Cents,
                        )}
                      </strong>
                    </article>

                    <article className="metric">
                      <label>
                        Meer dan 90 dagen
                      </label>

                      <strong>
                        {money(
                          data.aging
                            .over90Cents,
                        )}
                      </strong>
                    </article>
                  </div>
                </section>
              </>
            )}


            {tab ===
              "invoices" && (
              <section className="card">
                <div className="section-heading">
                  <div>
                    <h2>
                      Openstaande
                      inkoopfacturen
                    </h2>

                    <p>
                      Facturen die nog
                      geheel of
                      gedeeltelijk
                      betaald moeten
                      worden.
                    </p>
                  </div>

                  <WalletCards />
                </div>


                <div className="invoice-filters">
                  <label>
                    <Search
                      size={
                        16
                      }
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
                      placeholder="Zoek leverancier of factuurnummer"
                    />
                  </label>


                  <button
                    type="button"
                    className={
                      filter ===
                      "all"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setFilter(
                        "all",
                      )
                    }
                  >
                    Alles
                  </button>


                  <button
                    type="button"
                    className={
                      filter ===
                      "overdue"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setFilter(
                        "overdue",
                      )
                    }
                  >
                    Vervallen
                  </button>


                  <button
                    type="button"
                    className={
                      filter ===
                      "soon"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setFilter(
                        "soon",
                      )
                    }
                  >
                    Binnen 7 dagen
                  </button>


                  <button
                    type="button"
                    className={
                      filter ===
                      "partial"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setFilter(
                        "partial",
                      )
                    }
                  >
                    Deels betaald
                  </button>
                </div>


                <div className="invoice-list">
                  {
                    visibleItems.map(
                      (
                        item,
                      ) => (
                        <article
                          key={
                            item.id
                          }
                          className="invoice-row"
                        >
                          <div>
                            <strong>
                              {
                                item
                                  .creditor
                                  .name
                              }
                            </strong>

                            <small>
                              {
                                item.invoiceNumber
                              }
                              {" · "}
                              factuurdatum{" "}
                              {date(
                                item.invoiceDate,
                              )}
                            </small>
                          </div>


                          <div>
                            <small>
                              Vervaldatum
                            </small>

                            <strong>
                              {date(
                                item.dueDate,
                              )}
                            </strong>
                          </div>


                          <div>
                            <small>
                              Totaal
                            </small>

                            <strong>
                              {money(
                                item.totalCents,
                              )}
                            </strong>
                          </div>


                          <div>
                            <small>
                              Betaald
                            </small>

                            <strong>
                              {money(
                                item.paidCents,
                              )}
                            </strong>
                          </div>


                          <div>
                            <small>
                              Openstaand
                            </small>

                            <strong>
                              {money(
                                item.outstandingCents,
                              )}
                            </strong>
                          </div>


                          <span
                            className={`status ${
                              item.overdue
                                ? "bad"
                                : item.dueSoon
                                  ? "warn"
                                  : ""
                            }`}
                          >
                            {item.overdue
                              ? "Vervallen"
                              : item.paidCents >
                                  0
                                ? "Deels betaald"
                                : item.dueSoon
                                  ? "Vervalt binnenkort"
                                  : "Te betalen"}
                          </span>


                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              sessionStorage.setItem(
                                "customer-payable-detail",
                                JSON.stringify(
                                  item,
                                ),
                              );

                              onGo(
                                "Inkoopfactuurdetail",
                              );
                            }}
                          >
                            <FileText
                              size={
                                15
                              }
                            />

                            Bekijk factuur

                            <ArrowRight
                              size={
                                15
                              }
                            />
                          </button>
                        </article>
                      ),
                    )
                  }


                  {visibleItems.length ===
                    0 && (
                    <p>
                      Geen facturen
                      gevonden.
                    </p>
                  )}
                </div>
              </section>
            )}


            {tab ===
              "expected" && (
              <section className="card">
                <div className="section-heading">
                  <div>
                    <h2>
                      Verwachte kosten
                    </h2>

                    <p>
                      Periodieke en
                      bekende toekomstige
                      verplichtingen.
                    </p>
                  </div>

                  <Repeat2 />
                </div>


                <div className="invoice-list">
                  {
                    data.expectedCosts.map(
                      (
                        item,
                      ) => (
                        <article
                          key={
                            item.id
                          }
                          className="invoice-row"
                        >
                          <div>
                            <strong>
                              {
                                item.name
                              }
                            </strong>

                            <small>
                              {
                                frequencyLabel(
                                  item.frequency,
                                )
                              }
                            </small>
                          </div>

                          <div>
                            <small>
                              Verwacht bedrag
                            </small>

                            <strong>
                              {money(
                                item.expectedAmountCents,
                              )}
                            </strong>
                          </div>

                          <div>
                            <small>
                              Volgende datum
                            </small>

                            <strong>
                              {date(
                                item.nextExpectedDate,
                              )}
                            </strong>
                          </div>

                          <div>
                            <small>
                              Betaling
                            </small>

                            <strong>
                              {
                                item.automaticDebit
                                  ? "Automatische incasso"
                                  : "Zelf betalen"
                              }
                            </strong>
                          </div>
                        </article>
                      ),
                    )
                  }


                  {data.expectedCosts
                    .length ===
                    0 && (
                    <p>
                      Nog geen
                      periodieke kosten
                      geregistreerd.
                    </p>
                  )}
                </div>
              </section>
            )}


            {tab ===
              "missing" && (
              <section className="card">
                <div className="section-heading">
                  <div>
                    <h2>
                      Betaling zonder document
                    </h2>

                    <p>
                      Uitgaven waarvoor
                      nog geen factuur of
                      bon is aangeleverd.
                    </p>
                  </div>

                  <FileQuestion />
                </div>


                <div className="invoice-list">
                  {
                    data.missingDocuments.map(
                      (
                        item,
                      ) => (
                        <article
                          key={
                            item.id
                          }
                          className="invoice-row"
                        >
                          <div>
                            <strong>
                              {
                                item.counterparty ??
                                "Onbekende leverancier"
                              }
                            </strong>

                            <small>
                              {date(
                                item.transactionDate,
                              )}
                              {" · "}
                              {
                                item.description ??
                                "Geen omschrijving"
                              }
                            </small>
                          </div>

                          <div>
                            <small>
                              Bedrag
                            </small>

                            <strong>
                              {money(
                                item.amountCents,
                              )}
                            </strong>
                          </div>

                          <span className="status warn">
                            {
                              item.status ===
                              "requested"
                                ? "Opgevraagd"
                                : "Document ontbreekt"
                            }
                          </span>

                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              onGo(
                                "Documenten",
                              )
                            }
                          >
                            Document uploaden
                          </button>
                        </article>
                      ),
                    )
                  }


                  {data.missingDocuments
                    .length ===
                    0 && (
                    <p>
                      <CheckCircle2
                        size={
                          16
                        }
                      />
                      {" "}
                      Voor alle
                      bekende uitgaven is
                      documentatie aanwezig.
                    </p>
                  )}
                </div>
              </section>
            )}


            {tab ===
              "suppliers" && (
              <section className="card">
                <div className="section-heading">
                  <div>
                    <h2>
                      Leveranciers
                    </h2>

                    <p>
                      Crediteurenstamgegevens
                      en actuele
                      verplichtingen.
                    </p>
                  </div>

                  <Landmark />
                </div>


                <div className="invoice-list">
                  {
                    data.suppliers.map(
                      (
                        supplier,
                      ) => (
                        <article
                          key={
                            supplier.id
                          }
                          className="invoice-row"
                        >
                          <div>
                            <strong>
                              {
                                supplier.name
                              }
                            </strong>

                            <small>
                              {
                                supplier.iban ??
                                "Geen IBAN geregistreerd"
                              }
                            </small>
                          </div>

                          <div>
                            <small>
                              Openstaand
                            </small>

                            <strong>
                              {money(
                                supplier.outstandingCents,
                              )}
                            </strong>
                          </div>

                          <div>
                            <small>
                              Open facturen
                            </small>

                            <strong>
                              {
                                supplier.openCount
                              }
                            </strong>
                          </div>

                          <div>
                            <small>
                              Betaaltermijn
                            </small>

                            <strong>
                              {
                                supplier.paymentTermDays
                              }{" "}
                              dagen
                            </strong>
                          </div>

                          <div>
                            <small>
                              Oudste vervaldatum
                            </small>

                            <strong>
                              {date(
                                supplier.oldestDueDate,
                              )}
                            </strong>
                          </div>
                        </article>
                      ),
                    )
                  }


                  {data.suppliers.length ===
                    0 && (
                    <p>
                      Nog geen
                      leveranciers
                      geregistreerd.
                    </p>
                  )}
                </div>
              </section>
            )}
          </>
        )}
    </>
  );
}
