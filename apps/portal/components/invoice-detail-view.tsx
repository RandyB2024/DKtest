"use client";

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CircleAlert,
  FileText,
  ReceiptText,
  WalletCards,
} from "lucide-react";

type ReceivableDetail = {
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

type PayableDetail = {
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

  documentId: string | null;
  reference: string | null;
  description: string | null;
};

type Props =
  | {
      kind: "receivable";
      item: ReceivableDetail;
      onBack: () => void;
    }
  | {
      kind: "payable";
      item: PayableDetail;
      onBack: () => void;
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

export default function InvoiceDetailView(
  props: Props,
) {
  const { item } = props;

  const isReceivable =
    props.kind === "receivable";

  const relationName =
    isReceivable
      ? props.item.debtor.name
      : props.item.creditor.name;

  const relationLabel =
    isReceivable
      ? "Klant"
      : "Leverancier";

  const pageTitle =
    isReceivable
      ? "Verkoopfactuur"
      : "Inkoopfactuur";

  return (
    <div className="invoice-detail-page">
      <div className="heading">
        <div>
          <button
            type="button"
            className="customer-text-link"
            onClick={props.onBack}
          >
            <ArrowLeft />
            Terug naar{" "}
            {isReceivable
              ? "afnemers"
              : "leveranciers"}
          </button>

          <h1>{pageTitle}</h1>

          <p>
            {item.invoiceNumber}
          </p>
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
      </div>

      <section className="invoice-detail-summary">
        <article className="card">
          <div className="invoice-detail-icon">
            <Building2 />
          </div>

          <span>{relationLabel}</span>

          <strong>
            {relationName}
          </strong>
        </article>

        <article className="card">
          <div className="invoice-detail-icon">
            <CalendarDays />
          </div>

          <span>Factuurdatum</span>

          <strong>
            {date(
              item.invoiceDate,
            )}
          </strong>
        </article>

        <article className="card">
          <div className="invoice-detail-icon">
            <CircleAlert />
          </div>

          <span>Vervaldatum</span>

          <strong>
            {date(
              item.dueDate,
            )}
          </strong>
        </article>

        <article className="card">
          <div className="invoice-detail-icon">
            <WalletCards />
          </div>

          <span>Openstaand</span>

          <strong>
            {money(
              item.outstandingCents,
            )}
          </strong>
        </article>
      </section>

      <section className="invoice-detail-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <h2>
                Factuurgegevens
              </h2>

              <p>
                Financiële opbouw van
                deze factuur.
              </p>
            </div>

            <ReceiptText />
          </div>

          <dl className="invoice-detail-list">
            <div>
              <dt>
                Factuurnummer
              </dt>

              <dd>
                {item.invoiceNumber}
              </dd>
            </div>

            <div>
              <dt>
                Subtotaal
              </dt>

              <dd>
                {money(
                  item.subtotalCents,
                )}
              </dd>
            </div>

            <div>
              <dt>BTW</dt>

              <dd>
                {money(
                  item.vatCents,
                )}
              </dd>
            </div>

            <div className="invoice-detail-total">
              <dt>
                Factuurtotaal
              </dt>

              <dd>
                {money(
                  item.totalCents,
                )}
              </dd>
            </div>

            <div>
              <dt>Betaald</dt>

              <dd>
                {money(
                  item.paidCents,
                )}
              </dd>
            </div>

            <div className="invoice-detail-outstanding">
              <dt>
                Nog openstaand
              </dt>

              <dd>
                {money(
                  item.outstandingCents,
                )}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="section-heading">
            <div>
              <h2>
                Status
              </h2>

              <p>
                Huidige betaalstatus
                van deze factuur.
              </p>
            </div>

            <WalletCards />
          </div>

          <dl className="invoice-detail-list">
            <div>
              <dt>Status</dt>

              <dd>
                {item.overdue
                  ? "Vervallen"
                  : "Openstaand"}
              </dd>
            </div>

            <div>
              <dt>
                Betaald bedrag
              </dt>

              <dd>
                {money(
                  item.paidCents,
                )}
              </dd>
            </div>

            <div>
              <dt>
                Openstaand bedrag
              </dt>

              <dd>
                {money(
                  item.outstandingCents,
                )}
              </dd>
            </div>

            <div>
              <dt>
                Vervaldatum
              </dt>

              <dd>
                {date(
                  item.dueDate,
                )}
              </dd>
            </div>
          </dl>

          <div className="notice">
            Betalingen en
            bankmatching worden in
            de volgende stap aan deze
            factuur gekoppeld.
          </div>
        </article>
      </section>

      {!isReceivable && (
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>
                Inkoopinformatie
              </h2>

              <p>
                Aanvullende gegevens
                van deze
                leveranciersfactuur.
              </p>
            </div>

            <FileText />
          </div>

          <dl className="invoice-detail-list">
            <div>
              <dt>Referentie</dt>

              <dd>
                {props.item.reference ||
                  "Niet ingevuld"}
              </dd>
            </div>

            <div>
              <dt>
                Omschrijving
              </dt>

              <dd>
                {props.item.description ||
                  "Niet ingevuld"}
              </dd>
            </div>

            <div>
              <dt>
                Document
              </dt>

              <dd>
                {props.item.documentId
                  ? "Document gekoppeld"
                  : "Geen document gekoppeld"}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}