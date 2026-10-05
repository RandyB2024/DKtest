"use client";

import {
  Download,
  Eye,
  FileText,
  Search,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  PortalContext,
} from "@/lib/portal-access";


export type InvoiceArchiveItem = {
  id: string;
  invoiceNumber: string;
  invoiceKind: "invoice" | "credit";
  documentStatus: string;
  paymentStatus: string;
  collectionStatus: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  customerReference: string | null;
  pdfStoragePath: string | null;
  finalizedAt: string | null;
  sentAt: string | null;

  debtor: {
    id: string;
    name: string;
    email: string;
  };
};


type ResponseData = {
  items?: InvoiceArchiveItem[];
  error?: string;
};


type Props = {
  context: PortalContext;
  debtorId?: string | null;
  title?: string;
  description?: string;
  compact?: boolean;
};


const money =
  new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
    },
  );


const date =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );


function paymentLabel(
  item: InvoiceArchiveItem,
) {
  if (
    item.documentStatus ===
    "credited"
  ) {
    return "Gecrediteerd";
  }

  switch (
    item.paymentStatus
  ) {
    case "paid":
      return "Betaald";

    case "partially_paid":
      return "Deels betaald";

    case "overpaid":
      return "Te veel betaald";

    default:
      return item.outstandingCents > 0
        ? "Openstaand"
        : "Betaald";
  }
}


function paymentClass(
  item: InvoiceArchiveItem,
) {
  if (
    item.documentStatus ===
    "credited"
  ) {
    return "neutral";
  }

  if (
    item.paymentStatus ===
    "paid"
  ) {
    return "good";
  }

  return "warn";
}


export default function InvoiceArchive({
  context,
  debtorId = null,
  title = "Factuurarchief",
  description = "Alle definitieve verkoopfacturen.",
  compact = false,
}: Props) {
  const [
    items,
    setItems,
  ] =
    useState<
      InvoiceArchiveItem[]
    >([]);

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


  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      if (
        context.organizationId ===
        "all"
      ) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const params =
          new URLSearchParams({
            organizationId:
              context.organizationId,
          });

        if (debtorId) {
          params.set(
            "debtorId",
            debtorId,
          );
        }

        const response =
          await fetch(
            `/api/invoicing/archive?${params.toString()}`,
            {
              cache:
                "no-store",
            },
          );

        const result =
          (await response.json()) as ResponseData;

        if (!response.ok) {
          throw new Error(
            result.error ||
            "Factuurarchief kon niet worden geladen.",
          );
        }

        if (!cancelled) {
          setItems(
            result.items ?? [],
          );
        }
      } catch (caught) {
        if (!cancelled) {
          setItems([]);

          setError(
            caught instanceof
              Error
              ? caught.message
              : "Factuurarchief kon niet worden geladen.",
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
    debtorId,
  ]);


  const visible =
    useMemo(
      () => {
        const search =
          query
            .trim()
            .toLowerCase();

        if (!search) {
          return items;
        }

        return items.filter(
          (item) =>
            item.invoiceNumber
              .toLowerCase()
              .includes(
                search,
              ) ||
            item.debtor.name
              .toLowerCase()
              .includes(
                search,
              ),
        );
      },
      [
        items,
        query,
      ],
    );


  function pdfUrl(
    item: InvoiceArchiveItem,
    download = false,
  ) {
    const params =
      new URLSearchParams({
        organizationId:
          context.organizationId,
      });

    if (download) {
      params.set(
        "download",
        "1",
      );
    }

    return `/api/invoicing/invoices/${encodeURIComponent(
      item.id,
    )}/pdf?${params.toString()}`;
  }


  function preview(
    item: InvoiceArchiveItem,
  ) {
    window.open(
      pdfUrl(item),
      "_blank",
      "noopener,noreferrer",
    );
  }


  function download(
    item: InvoiceArchiveItem,
  ) {
    window.location.href =
      pdfUrl(
        item,
        true,
      );
  }


  if (
    context.organizationId ===
    "all"
  ) {
    return null;
  }


  return (
    <section
      className={`card invoice-archive ${
        compact
          ? "invoice-archive-compact"
          : ""
      }`}
    >

      <div className="section-heading">
        <div>
          <h2>
            {title}
          </h2>

          <p>
            {description}
          </p>
        </div>

        <FileText />
      </div>


      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}


      {!compact && (
        <label className="invoice-archive-search">
          <Search size={16} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="Zoek factuurnummer of debiteur"
          />
        </label>
      )}


      {loading ? (
        <p>
          Factuurarchief wordt
          geladen...
        </p>
      ) : visible.length ===
        0 ? (
        <div className="invoice-archive-empty">
          <FileText />

          <strong>
            Nog geen definitieve
            facturen
          </strong>

          <span>
            Definitief gemaakte
            facturen verschijnen hier
            automatisch.
          </span>
        </div>
      ) : (
        <div className="invoice-archive-list">

          {visible.map(
            (item) => (
              <article
                key={item.id}
                className="invoice-archive-row"
              >

                <div className="invoice-archive-main">
                  <small>
                    {item.invoiceKind ===
                    "credit"
                      ? "CREDITFACTUUR"
                      : "FACTUUR"}
                  </small>

                  <strong>
                    {
                      item.invoiceNumber
                    }
                  </strong>

                  <span>
                    {
                      item.debtor
                        .name
                    }
                    {" · "}
                    {date.format(
                      new Date(
                        `${item.invoiceDate}T12:00:00`,
                      ),
                    )}
                  </span>
                </div>


                <div className="invoice-archive-amount">
                  <small>
                    Totaal
                  </small>

                  <strong>
                    {money.format(
                      item.totalCents /
                        100,
                    )}
                  </strong>

                  {item.outstandingCents >
                    0 && (
                    <span>
                      Open{" "}
                      {money.format(
                        item.outstandingCents /
                          100,
                      )}
                    </span>
                  )}
                </div>


                <span
                  className={`status ${paymentClass(
                    item,
                  )}`}
                >
                  {paymentLabel(
                    item,
                  )}
                </span>


                <div className="invoice-archive-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      preview(
                        item,
                      )
                    }
                  >
                    <Eye size={14} />
                    Bekijk
                  </button>

                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      download(
                        item,
                      )
                    }
                  >
                    <Download
                      size={14}
                    />
                    PDF
                  </button>
                </div>

              </article>
            ),
          )}

        </div>
      )}

    </section>
  );
}
