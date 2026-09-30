"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileText,
  Landmark,
  MessageSquare,
  ReceiptText,
  Upload,
  WalletCards,
} from "lucide-react";

import FinancialChart from "@/components/financial-chart";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";

type CustomerDashboardProps = {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo?: (view: string) => void;
};

type Period =
  | "Dag"
  | "Week"
  | "Maand"
  | "Kwartaal"
  | "Halfjaar"
  | "Jaar";

type Comparison =
  | "Geen vergelijking"
  | "Vorige periode"
  | "Vorig jaar";

type MetricCardProps = {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  onClick?: () => void;
  loading?: boolean;
};

type OpenPositions = {
  receivables: {
    totalCents: number;
    overdueCents: number;
    count: number;
  };

  payables: {
    totalCents: number;
    overdueCents: number;
    count: number;
  };
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

  reconciliationStatus: string;
  paymentId: string | null;
};

type BankResponse = {
  accounts: Array<{
    id: string;
    accountName: string;
    iban: string | null;
    status: string;
  }>;

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

type PeriodSummary = {
  period:
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "halfyear"
    | "year";

  startDate: string;
  endDate: string;

  revenueCents: number;
  costsCents: number;
  resultCents: number;

  salesInvoiceCount: number;
  purchaseInvoiceCount: number;
};

type PeriodSeries = {
  period:
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "halfyear"
    | "year";

  startDate: string;
  endDate: string;

  buckets: Array<{
    index: number;
    startDate: string;
    endDate: string;
    revenueCents: number;
    costsCents: number;
    resultCents: number;
  }>;
};

const periods: Period[] = [
  "Dag",
  "Week",
  "Maand",
  "Kwartaal",
  "Halfjaar",
  "Jaar",
];

const periodApiValue: Record<
  Period,
  PeriodSummary["period"]
> = {
  Dag: "day",
  Week: "week",
  Maand: "month",
  Kwartaal: "quarter",
  Halfjaar: "halfyear",
  Jaar: "year",
};

const comparisons: Comparison[] = [
  "Geen vergelijking",
  "Vorige periode",
  "Vorig jaar",
];

const euro = new Intl.NumberFormat(
  "nl-NL",
  {
    style: "currency",
    currency: "EUR",
  },
);

const shortDate =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
    },
  );

const fullDate =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

function money(cents: number) {
  return euro.format(cents / 100);
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  onClick,
  loading = false,
}: MetricCardProps) {
  return (
    <button
      type="button"
      className="customer-kpi"
      onClick={onClick}
    >
      <div className="customer-kpi-top">
        <span>{title}</span>

        <span className="customer-kpi-icon">
          {icon}
        </span>
      </div>

      <strong>
        {loading
          ? "Laden..."
          : value}
      </strong>

      <small>{subtitle}</small>

      <div className="customer-kpi-bottom">
        <span>
          Bekijk details
        </span>

        <ArrowRight />
      </div>
    </button>
  );
}

function getQuarter() {
  const now = new Date();

  const quarter =
    Math.floor(
      now.getMonth() / 3,
    ) + 1;

  return {
    quarter,
    year: now.getFullYear(),
    label: `Q${quarter} ${now.getFullYear()}`,
  };
}

export default function CustomerDashboard({
  context,
  organization,
  onGo,
}: CustomerDashboardProps) {
  const [period, setPeriod] =
    useState<Period>("Maand");

  const [
    comparison,
    setComparison,
  ] =
    useState<Comparison>(
      "Vorig jaar",
    );

  const [
    openPositions,
    setOpenPositions,
  ] =
    useState<OpenPositions | null>(
      null,
    );

  const [
    bankData,
    setBankData,
  ] =
    useState<BankResponse | null>(
      null,
    );

  const [
    periodSummary,
    setPeriodSummary,
  ] =
    useState<PeriodSummary | null>(
      null,
    );

  const [
    periodSeries,
    setPeriodSeries,
  ] =
    useState<PeriodSeries | null>(
      null,
    );

  const [
    financialLoading,
    setFinancialLoading,
  ] =
    useState(false);

  const [
    bankLoading,
    setBankLoading,
  ] =
    useState(false);

  const [
    periodSummaryLoading,
    setPeriodSummaryLoading,
  ] =
    useState(false);

  const [
    periodSeriesLoading,
    setPeriodSeriesLoading,
  ] =
    useState(false);

  const [
    financialError,
    setFinancialError,
  ] =
    useState("");

  const [
    bankError,
    setBankError,
  ] =
    useState("");

  const [
    periodSummaryError,
    setPeriodSummaryError,
  ] =
    useState("");

  const [
    periodSeriesError,
    setPeriodSeriesError,
  ] =
    useState("");

  const firstName =
    context.profile.display_name
      .trim()
      .split(/\s+/)[0] ||
    "daar";

  const companyName =
    organization?.name ??
    (context.organizationId ===
    "all"
      ? "Alle administraties"
      : "Uw administratie");

  const quarter =
    useMemo(
      () => getQuarter(),
      [],
    );

  useEffect(() => {
    let cancelled = false;

    async function loadOpenPositions() {
      if (
        context.organizationId ===
        "all"
      ) {
        setOpenPositions(null);
        setFinancialError("");
        return;
      }

      setFinancialLoading(true);
      setFinancialError("");

      try {
        const response =
          await fetch(
            `/api/financial/open-positions?organizationId=${encodeURIComponent(
              context.organizationId,
            )}`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as
            | OpenPositions
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in data &&
              data.error
              ? data.error
              : "Financiële gegevens konden niet worden geladen.",
          );
        }

        if (!cancelled) {
          setOpenPositions(
            data as OpenPositions,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setOpenPositions(null);

          setFinancialError(
            error instanceof Error
              ? error.message
              : "Financiële gegevens konden niet worden geladen.",
          );
        }
      } finally {
        if (!cancelled) {
          setFinancialLoading(
            false,
          );
        }
      }
    }

    void loadOpenPositions();

    return () => {
      cancelled = true;
    };
  }, [
    context.organizationId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadBank() {
      if (
        context.organizationId ===
        "all"
      ) {
        setBankData(null);
        setBankError("");
        return;
      }

      setBankLoading(true);
      setBankError("");

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

        const data =
          (await response.json()) as
            | BankResponse
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in data &&
              data.error
              ? data.error
              : "Bankgegevens konden niet worden geladen.",
          );
        }

        if (!cancelled) {
          setBankData(
            data as BankResponse,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setBankData(null);

          setBankError(
            error instanceof Error
              ? error.message
              : "Bankgegevens konden niet worden geladen.",
          );
        }
      } finally {
        if (!cancelled) {
          setBankLoading(false);
        }
      }
    }

    void loadBank();

    return () => {
      cancelled = true;
    };
  }, [
    context.organizationId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodSummary() {
      if (
        context.organizationId ===
        "all"
      ) {
        setPeriodSummary(null);
        setPeriodSummaryError("");
        return;
      }

      setPeriodSummaryLoading(true);
      setPeriodSummaryError("");

      try {
        const response =
          await fetch(
            `/api/financial/period-summary?organizationId=${encodeURIComponent(
              context.organizationId,
            )}&period=${encodeURIComponent(
              periodApiValue[period],
            )}`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as
            | PeriodSummary
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in data &&
              data.error
              ? data.error
              : "Periodecijfers konden niet worden geladen.",
          );
        }

        if (!cancelled) {
          setPeriodSummary(
            data as PeriodSummary,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setPeriodSummary(null);

          setPeriodSummaryError(
            error instanceof Error
              ? error.message
              : "Periodecijfers konden niet worden geladen.",
          );
        }
      } finally {
        if (!cancelled) {
          setPeriodSummaryLoading(
            false,
          );
        }
      }
    }

    void loadPeriodSummary();

    return () => {
      cancelled = true;
    };
  }, [
    context.organizationId,
    period,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadPeriodSeries() {
      if (
        context.organizationId ===
        "all"
      ) {
        setPeriodSeries(null);
        setPeriodSeriesError("");
        return;
      }

      setPeriodSeriesLoading(true);
      setPeriodSeriesError("");

      try {
        const response =
          await fetch(
            `/api/financial/period-series?organizationId=${encodeURIComponent(
              context.organizationId,
            )}&period=${encodeURIComponent(
              periodApiValue[period],
            )}`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as
            | PeriodSeries
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in data &&
              data.error
              ? data.error
              : "Grafiekgegevens konden niet worden geladen.",
          );
        }

        if (!cancelled) {
          setPeriodSeries(
            data as PeriodSeries,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setPeriodSeries(null);

          setPeriodSeriesError(
            error instanceof Error
              ? error.message
              : "Grafiekgegevens konden niet worden geladen.",
          );
        }
      } finally {
        if (!cancelled) {
          setPeriodSeriesLoading(
            false,
          );
        }
      }
    }

    void loadPeriodSeries();

    return () => {
      cancelled = true;
    };
  }, [
    context.organizationId,
    period,
  ]);

  function go(
    view: string,
    detail?: string,
  ) {
    if (detail) {
      sessionStorage.setItem(
        "customer-dashboard-detail",
        JSON.stringify({
          organizationId:
            context.organizationId,
          detail,
          period,
          comparison,
        }),
      );
    }

    onGo?.(view);
  }

  const revenueValue =
    context.organizationId ===
    "all"
      ? "Selecteer onderneming"
      : periodSummary
        ? money(
            periodSummary.revenueCents,
          )
        : "Nog geen gegevens";

  const resultValue =
    context.organizationId ===
    "all"
      ? "Selecteer onderneming"
      : periodSummary
        ? money(
            periodSummary.resultCents,
          )
        : "Nog geen gegevens";

  const costsValue =
    context.organizationId ===
    "all"
      ? "Selecteer onderneming"
      : periodSummary
        ? money(
            periodSummary.costsCents,
          )
        : "Nog geen gegevens";

  const periodRange =
    periodSummary
      ? `${fullDate.format(
          new Date(
            `${periodSummary.startDate}T12:00:00`,
          ),
        )} t/m ${fullDate.format(
          new Date(
            `${periodSummary.endDate}T12:00:00`,
          ),
        )}`
      : period;

  const revenueSubtitle =
    periodSummary
      ? `${periodRange} · ${periodSummary.salesInvoiceCount} verkoopfactuur${
          periodSummary.salesInvoiceCount ===
          1
            ? ""
            : "en"
        }`
      : `Omzet binnen deze ${period.toLowerCase()}`;

  const resultSubtitle =
    periodSummary
      ? `Kosten ${costsValue} · ${periodRange}`
      : "Omzet minus kosten binnen dezelfde periode";

  const receivablesValue =
    context.organizationId ===
    "all"
      ? "Selecteer onderneming"
      : openPositions
        ? money(
            openPositions
              .receivables
              .totalCents,
          )
        : "Nog geen gegevens";

  const payablesValue =
    context.organizationId ===
    "all"
      ? "Selecteer onderneming"
      : openPositions
        ? money(
            openPositions
              .payables
              .totalCents,
          )
        : "Nog geen gegevens";

  const receivablesSubtitle =
    openPositions &&
    context.organizationId !==
      "all"
      ? `${openPositions.receivables.count} openstaand${
          openPositions
            .receivables.count ===
          1
            ? "e factuur"
            : "e facturen"
        }${
          openPositions
            .receivables
            .overdueCents > 0
            ? ` · ${money(
                openPositions
                  .receivables
                  .overdueCents,
              )} vervallen`
            : ""
        }`
      : "Bedrag dat u nog moet ontvangen";

  const payablesSubtitle =
    openPositions &&
    context.organizationId !==
      "all"
      ? `${openPositions.payables.count} openstaand${
          openPositions
            .payables.count === 1
            ? "e factuur"
            : "e facturen"
        }${
          openPositions.payables
            .overdueCents > 0
            ? ` · ${money(
                openPositions
                  .payables
                  .overdueCents,
              )} vervallen`
            : ""
        }`
      : "Bedrag dat u nog moet betalen";

  const recentBankTransactions =
    bankData?.transactions.items.slice(
      0,
      4,
    ) ?? [];

  return (
    <div className="customer-dashboard-v2">
      <section className="customer-dashboard-header">
        <div>
          <span className="customer-dashboard-eyebrow">
            Overzicht
          </span>

          <h1>
            Goedemorgen, {firstName}
          </h1>

          <p>
            In één oogopslag de
            financiële stand van{" "}
            <strong>
              {companyName}
            </strong>
            .
          </p>
        </div>

        <div className="customer-dashboard-meta">
          <span>
            <Building2 />
            {companyName}
          </span>

          <span>
            <CalendarDays />
            Bijgewerkt: vandaag
          </span>
        </div>
      </section>

      {financialError && (
        <div
          className="notice"
          role="alert"
        >
          {financialError}
        </div>
      )}

      {bankError && (
        <div
          className="notice"
          role="alert"
        >
          {bankError}
        </div>
      )}

      {periodSummaryError && (
        <div
          className="notice"
          role="alert"
        >
          {periodSummaryError}
        </div>
      )}

      {periodSeriesError && (
        <div
          className="notice"
          role="alert"
        >
          {periodSeriesError}
        </div>
      )}

      <section className="customer-kpi-grid">
        <MetricCard
          title="Omzet"
          value={revenueValue}
          subtitle={revenueSubtitle}
          icon={<ReceiptText />}
          loading={
            periodSummaryLoading &&
            context.organizationId !==
              "all"
          }
          onClick={() =>
            go(
              "Rapportages",
              "omzet",
            )
          }
        />

        <MetricCard
          title="Resultaat"
          value={resultValue}
          subtitle={resultSubtitle}
          icon={<WalletCards />}
          loading={
            periodSummaryLoading &&
            context.organizationId !==
              "all"
          }
          onClick={() =>
            go(
              "Rapportages",
              "resultaat",
            )
          }
        />

        <MetricCard
          title="Debiteuren"
          value={
            receivablesValue
          }
          subtitle={
            receivablesSubtitle
          }
          icon={<FileText />}
          loading={
            financialLoading &&
            context.organizationId !==
              "all"
          }
          onClick={() =>
            go(
              "Facturen",
              "debiteuren",
            )
          }
        />

        <MetricCard
          title="Crediteuren"
          value={
            payablesValue
          }
          subtitle={
            payablesSubtitle
          }
          icon={<Landmark />}
          loading={
            financialLoading &&
            context.organizationId !==
              "all"
          }
          onClick={() =>
            go(
              "Crediteuren",
              "crediteuren",
            )
          }
        />
      </section>

      <section className="customer-chart-panel">
        <div className="customer-chart-heading">
          <div>
            <span className="customer-section-label">
              Financiële
              ontwikkeling
            </span>

            <h2>
              Hoe staat u ervoor?
            </h2>

            <p>
              Bekijk omzet, kosten en
              resultaat over de
              gewenste periode.
            </p>
          </div>

          <div className="customer-chart-controls">
            <label>
              <span>Periode</span>

              <div>
                <select
                  value={period}
                  onChange={(
                    event,
                  ) =>
                    setPeriod(
                      event.target
                        .value as Period,
                    )
                  }
                >
                  {periods.map(
                    (item) => (
                      <option
                        key={item}
                      >
                        {item}
                      </option>
                    ),
                  )}
                </select>

                <ChevronDown />
              </div>
            </label>

            <label>
              <span>
                Vergelijken met
              </span>

              <div>
                <select
                  value={
                    comparison
                  }
                  onChange={(
                    event,
                  ) =>
                    setComparison(
                      event.target
                        .value as Comparison,
                    )
                  }
                >
                  {comparisons.map(
                    (item) => (
                      <option
                        key={item}
                      >
                        {item}
                      </option>
                    ),
                  )}
                </select>

                <ChevronDown />
              </div>
            </label>
          </div>
        </div>

        {periodSeriesError ? (
          <div className="customer-chart-empty">
            <div className="customer-chart-icon">
              <ChartNoAxesCombined />
            </div>

            <strong>
              Grafiek kon niet worden geladen
            </strong>

            <p>{periodSeriesError}</p>
          </div>
        ) : periodSeriesLoading ? (
          <div className="customer-chart-empty">
            <div className="customer-chart-icon">
              <ChartNoAxesCombined />
            </div>

            <strong>
              Grafiek wordt geladen...
            </strong>

            <p>
              Financiële ontwikkeling wordt
              opgebouwd voor{" "}
              {period.toLowerCase()}.
            </p>
          </div>
        ) : periodSeries &&
          periodSeries.buckets.length > 0 ? (
          <FinancialChart
            buckets={
              periodSeries.buckets
            }
          />
        ) : (
          <div className="customer-chart-empty">
            <div className="customer-chart-icon">
              <ChartNoAxesCombined />
            </div>

            <strong>
              Nog geen grafiekgegevens
            </strong>

            <p>
              Zodra er facturen in deze
              periode zijn, wordt de grafiek
              automatisch gevuld.
            </p>
          </div>
        )}

              </section>

      <section className="customer-dashboard-middle">
        <article className="customer-dashboard-card attention">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Prioriteit
              </span>

              <h2>
                Aandacht nodig
              </h2>
            </div>

            <CircleAlert />
          </div>

          <button
            type="button"
            className="customer-action-row"
            onClick={() =>
              go(
                "Documenten",
                "ontbrekende-documenten",
              )
            }
          >
            <strong>0</strong>

            <span>
              <b>
                Ontbrekende
                documenten
              </b>

              <small>
                Bonnen of facturen
                die nog nodig zijn
              </small>
            </span>

            <ArrowRight />
          </button>

          <button
            type="button"
            className="customer-action-row"
            onClick={() =>
              go(
                "Communicatie",
                "open-vragen",
              )
            }
          >
            <strong>0</strong>

            <span>
              <b>Open vragen</b>

              <small>
                Vragen waarop nog
                antwoord nodig is
              </small>
            </span>

            <ArrowRight />
          </button>

          <button
            type="button"
            className="customer-action-row"
            onClick={() =>
              go(
                "Aangiften",
                "aangifte-acties",
              )
            }
          >
            <strong>0</strong>

            <span>
              <b>Aangiften</b>

              <small>
                Aangiften die
                controle of akkoord
                nodig hebben
              </small>
            </span>

            <ArrowRight />
          </button>
        </article>

        <article className="customer-dashboard-card bank-summary">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Bank
              </span>

              <h2>
                Bankmutaties
              </h2>
            </div>

            <WalletCards />
          </div>

          {bankLoading ? (
            <p>
              Bankgegevens worden
              geladen...
            </p>
          ) : recentBankTransactions
              .length === 0 ? (
            <div className="customer-bank-empty">
              <span>
                Nog geen
                banktransacties
              </span>

              <small>
                Zodra de
                bankkoppeling actief
                is verschijnen hier
                de laatste mutaties.
              </small>
            </div>
          ) : (
            <div className="customer-bank-list">
              {recentBankTransactions.map(
                (item) => {
                  const incoming =
                    item.amountCents >
                    0;

                  const linked =
                    item.reconciliationStatus ===
                    "matched";

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className="customer-bank-row"
                      onClick={() =>
                        go(
                          "Bankieren",
                        )
                      }
                    >
                      <span
                        className={`customer-bank-direction ${
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
                      </span>

                      <span className="customer-bank-copy">
                        <b>
                          {item.counterpartyName ||
                            "Onbekende tegenpartij"}
                        </b>

                        <small>
                          {shortDate.format(
                            new Date(
                              item.bookedAt,
                            ),
                          )}
                        </small>
                      </span>

                      <span className="customer-bank-amount">
                        <strong>
                          {money(
                            item.amountCents,
                          )}
                        </strong>

                        <small
                          className={
                            linked
                              ? "linked"
                              : "unlinked"
                          }
                        >
                          {linked
                            ? "Gekoppeld"
                            : "Niet gekoppeld"}
                        </small>
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          )}

          <button
            type="button"
            className="customer-text-link"
            onClick={() =>
              go("Bankieren")
            }
          >
            Bekijk bankieren
            <ArrowRight />
          </button>
        </article>

        <article className="customer-dashboard-card vat-summary">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Omzetbelasting
              </span>

              <h2>
                {quarter.label}
              </h2>
            </div>

            <ReceiptText />
          </div>

          <div className="customer-vat-main">
            <span>
              Verwachte btw
            </span>

            <strong>
              Nog geen gegevens
            </strong>

            <small>
              Te betalen of terug te
              ontvangen wordt hier
              automatisch berekend
              zodra de btw-boekingen
              beschikbaar zijn.
            </small>
          </div>

          <dl className="customer-vat-list">
            <div>
              <dt>
                Verschuldigde btw
              </dt>

              <dd>—</dd>
            </div>

            <div>
              <dt>
                Voorbelasting
              </dt>

              <dd>—</dd>
            </div>

            <div>
              <dt>
                Saldo
              </dt>

              <dd>—</dd>
            </div>
          </dl>

          <button
            type="button"
            className="customer-text-link"
            onClick={() =>
              go(
                "Aangiften",
                "omzetbelasting",
              )
            }
          >
            Bekijk omzetbelasting
            <ArrowRight />
          </button>
        </article>
      </section>

      <section className="customer-dashboard-bottom">
        <article className="customer-dashboard-card outstanding">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Geldstromen
              </span>

              <h2>
                Openstaande posten
              </h2>
            </div>

            <ReceiptText />
          </div>

          <div className="customer-outstanding-grid">
            <button
              type="button"
              onClick={() =>
                go(
                  "Facturen",
                  "debiteuren",
                )
              }
            >
              <span>
                Te ontvangen
              </span>

              <strong>
                {financialLoading
                  ? "Laden..."
                  : receivablesValue}
              </strong>

              <small>
                {openPositions
                  ? `${openPositions.receivables.count} openstaande factuur${
                      openPositions
                        .receivables
                        .count === 1
                        ? ""
                        : "en"
                    }`
                  : "Bekijk van wie u nog geld krijgt"}
              </small>

              <b>
                Open debiteuren
                <ArrowRight />
              </b>
            </button>

            <button
              type="button"
              onClick={() =>
                go(
                  "Crediteuren",
                  "crediteuren",
                )
              }
            >
              <span>
                Te betalen
              </span>

              <strong>
                {financialLoading
                  ? "Laden..."
                  : payablesValue}
              </strong>

              <small>
                {openPositions
                  ? `${openPositions.payables.count} openstaande factuur${
                      openPositions
                        .payables
                        .count === 1
                        ? ""
                        : "en"
                    }`
                  : "Bekijk aan wie u nog moet betalen"}
              </small>

              <b>
                Open crediteuren
                <ArrowRight />
              </b>
            </button>
          </div>
        </article>

        <article className="customer-dashboard-card quick">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Direct regelen
              </span>

              <h2>
                Snelle acties
              </h2>
            </div>
          </div>

          <div className="customer-quick-grid">
            <button
              type="button"
              onClick={() =>
                go(
                  "Documenten",
                  "upload",
                )
              }
            >
              <Upload />

              <span>
                <b>
                  Document uploaden
                </b>

                <small>
                  Bon of factuur
                  toevoegen
                </small>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                go(
                  "Communicatie",
                  "nieuwe-vraag",
                )
              }
            >
              <MessageSquare />

              <span>
                <b>
                  Vraag stellen
                </b>

                <small>
                  Contact met uw
                  administratie
                </small>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                go(
                  "Facturen",
                  "nieuwe-factuur",
                )
              }
            >
              <ReceiptText />

              <span>
                <b>
                  Factuur maken
                </b>

                <small>
                  Nieuwe
                  verkoopfactuur
                </small>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                go(
                  "Rapportages",
                  "rapport",
                )
              }
            >
              <ChartNoAxesCombined />

              <span>
                <b>
                  Rapport bekijken
                </b>

                <small>
                  Financiële stand
                  bekijken
                </small>
              </span>
            </button>
          </div>
        </article>
      </section>

      <footer className="customer-dashboard-footer">
        <span>
          <CheckCircle2 />
          Beveiligde administratie
        </span>

        <span>
          <CheckCircle2 />
          Financiële gegevens uit de
          administratie
        </span>

        <span>
          Laatst bijgewerkt:
          vandaag
        </span>
      </footer>
    </div>
  );
}