"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  Landmark,
  MessageSquare,
  ReceiptText,
  Upload,
  WalletCards,
} from "lucide-react";

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
};

const periods: Period[] = [
  "Dag",
  "Week",
  "Maand",
  "Kwartaal",
  "Halfjaar",
  "Jaar",
];

const comparisons: Comparison[] = [
  "Geen vergelijking",
  "Vorige periode",
  "Vorig jaar",
];

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  onClick,
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

      <strong>{value}</strong>

      <small>{subtitle}</small>

      <div className="customer-kpi-bottom">
        <span>Bekijk details</span>
        <ArrowRight />
      </div>
    </button>
  );
}

export default function CustomerDashboard({
  context,
  organization,
  onGo,
}: CustomerDashboardProps) {
  const [period, setPeriod] = useState<Period>("Maand");
  const [comparison, setComparison] =
    useState<Comparison>("Vorig jaar");

  const firstName =
    context.profile.display_name.trim().split(/\s+/)[0] ||
    "daar";

  const companyName =
    organization?.name ??
    (context.organizationId === "all"
      ? "Alle administraties"
      : "Uw administratie");

  function go(view: string, detail?: string) {
    if (detail) {
      sessionStorage.setItem(
        "customer-dashboard-detail",
        JSON.stringify({
          organizationId: context.organizationId,
          detail,
          period,
          comparison,
        }),
      );
    }

    onGo?.(view);
  }

  return (
    <div className="customer-dashboard-v2">
      <section className="customer-dashboard-header">
        <div>
          <span className="customer-dashboard-eyebrow">
            Overzicht
          </span>

          <h1>Goedemorgen, {firstName}</h1>

          <p>
            In één oogopslag de financiële stand van{" "}
            <strong>{companyName}</strong>.
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

      <section className="customer-kpi-grid">
        <MetricCard
          title="Omzet"
          value="Nog geen gegevens"
          subtitle="Omzet binnen de geselecteerde periode"
          icon={<ReceiptText />}
          onClick={() =>
            go("Rapportages", "omzet")
          }
        />

        <MetricCard
          title="Resultaat"
          value="Nog geen gegevens"
          subtitle="Omzet minus verwerkte kosten"
          icon={<WalletCards />}
          onClick={() =>
            go("Rapportages", "resultaat")
          }
        />

        <MetricCard
          title="Debiteuren"
          value="Nog geen gegevens"
          subtitle="Bedrag dat u nog moet ontvangen"
          icon={<FileText />}
          onClick={() =>
            go("Facturen", "debiteuren")
          }
        />

        <MetricCard
          title="Crediteuren"
          value="Nog geen gegevens"
          subtitle="Bedrag dat u nog moet betalen"
          icon={<Landmark />}
          onClick={() =>
            go("Documenten", "crediteuren")
          }
        />
      </section>

      <section className="customer-chart-panel">
        <div className="customer-chart-heading">
          <div>
            <span className="customer-section-label">
              Financiële ontwikkeling
            </span>

            <h2>Hoe staat u ervoor?</h2>

            <p>
              Bekijk omzet, kosten en resultaat over de
              gewenste periode.
            </p>
          </div>

          <div className="customer-chart-controls">
            <label>
              <span>Periode</span>

              <div>
                <select
                  value={period}
                  onChange={(event) =>
                    setPeriod(
                      event.target.value as Period,
                    )
                  }
                >
                  {periods.map((item) => (
                    <option key={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <ChevronDown />
              </div>
            </label>

            <label>
              <span>Vergelijken met</span>

              <div>
                <select
                  value={comparison}
                  onChange={(event) =>
                    setComparison(
                      event.target.value as Comparison,
                    )
                  }
                >
                  {comparisons.map((item) => (
                    <option key={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <ChevronDown />
              </div>
            </label>
          </div>
        </div>

        <div className="customer-chart-empty">
          <div className="customer-chart-icon">
            <ChartNoAxesCombined />
          </div>

          <strong>
            Financiële grafiek wordt automatisch gevuld
          </strong>

          <p>
            Zodra boekingen beschikbaar zijn, ziet u hier
            omzet, kosten en resultaat per {period.toLowerCase()}.
          </p>

          {comparison !== "Geen vergelijking" && (
            <small>
              Vergelijking: {comparison.toLowerCase()}
            </small>
          )}
        </div>

        <div className="customer-chart-legend">
          <span>
            <i className="revenue" />
            Omzet
          </span>

          <span>
            <i className="costs" />
            Kosten
          </span>

          <span>
            <i className="result" />
            Resultaat
          </span>
        </div>
      </section>

      <section className="customer-dashboard-middle">
        <article className="customer-dashboard-card attention">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Prioriteit
              </span>

              <h2>Aandacht nodig</h2>
            </div>

            <CircleAlert />
          </div>

          <button
            type="button"
            className="customer-action-row"
            onClick={() =>
              go("Documenten", "ontbrekende-documenten")
            }
          >
            <strong>0</strong>

            <span>
              <b>Ontbrekende documenten</b>
              <small>
                Bonnen of facturen die nog nodig zijn
              </small>
            </span>

            <ArrowRight />
          </button>

          <button
            type="button"
            className="customer-action-row"
            onClick={() =>
              go("Communicatie", "open-vragen")
            }
          >
            <strong>0</strong>

            <span>
              <b>Open vragen</b>
              <small>
                Vragen waarop nog antwoord nodig is
              </small>
            </span>

            <ArrowRight />
          </button>

          <button
            type="button"
            className="customer-action-row"
            onClick={() =>
              go("Aangiften", "aangifte-acties")
            }
          >
            <strong>0</strong>

            <span>
              <b>Aangiften</b>
              <small>
                Aangiften die controle of akkoord nodig hebben
              </small>
            </span>

            <ArrowRight />
          </button>
        </article>

        <article className="customer-dashboard-card tasks">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Vandaag
              </span>

              <h2>Uw acties</h2>
            </div>

            <Clock3 />
          </div>

          <div className="customer-task-total">
            <span>Open acties</span>
            <strong>0</strong>
          </div>

          <div className="customer-task-total overdue">
            <span>Achterstallig</span>
            <strong>0</strong>
          </div>

          <button
            type="button"
            className="customer-text-link"
            onClick={() =>
              go("Notificaties", "alle-acties")
            }
          >
            Bekijk alle acties
            <ArrowRight />
          </button>
        </article>

        <article className="customer-dashboard-card status">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Administratie
              </span>

              <h2>Status</h2>
            </div>

            <CheckCircle2 />
          </div>

          <dl>
            <div>
              <dt>Onderneming</dt>
              <dd>{companyName}</dd>
            </div>

            <div>
              <dt>KvK-nummer</dt>
              <dd>
                {organization?.registration_number ||
                  "Nog niet ingevuld"}
              </dd>
            </div>

            <div>
              <dt>Account</dt>
              <dd>Actief</dd>
            </div>

            <div>
              <dt>Beveiliging</dt>
              <dd>
                {context.aal2
                  ? "2FA actief"
                  : "Ingelogd"}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="customer-dashboard-bottom">
        <article className="customer-dashboard-card outstanding">
          <div className="customer-card-heading">
            <div>
              <span className="customer-section-label">
                Geldstromen
              </span>

              <h2>Openstaande posten</h2>
            </div>

            <ReceiptText />
          </div>

          <div className="customer-outstanding-grid">
            <button
              type="button"
              onClick={() =>
                go("Facturen", "debiteuren")
              }
            >
              <span>Te ontvangen</span>
              <strong>Nog geen gegevens</strong>
              <small>
                Bekijk van wie u nog geld krijgt
              </small>

              <b>
                Open debiteuren
                <ArrowRight />
              </b>
            </button>

            <button
              type="button"
              onClick={() =>
                go("Documenten", "crediteuren")
              }
            >
              <span>Te betalen</span>
              <strong>Nog geen gegevens</strong>
              <small>
                Bekijk aan wie u nog moet betalen
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

              <h2>Snelle acties</h2>
            </div>
          </div>

          <div className="customer-quick-grid">
            <button
              type="button"
              onClick={() =>
                go("Documenten", "upload")
              }
            >
              <Upload />
              <span>
                <b>Document uploaden</b>
                <small>Bon of factuur toevoegen</small>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                go("Communicatie", "nieuwe-vraag")
              }
            >
              <MessageSquare />
              <span>
                <b>Vraag stellen</b>
                <small>Contact met uw administratie</small>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                go("Facturen", "nieuwe-factuur")
              }
            >
              <ReceiptText />
              <span>
                <b>Factuur maken</b>
                <small>Nieuwe verkoopfactuur</small>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                go("Rapportages", "rapport")
              }
            >
              <ChartNoAxesCombined />
              <span>
                <b>Rapport bekijken</b>
                <small>Financiële stand bekijken</small>
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
          Realtime zodra gegevens gekoppeld zijn
        </span>

        <span>
          Laatst bijgewerkt: vandaag
        </span>
      </footer>
    </div>
  );
}