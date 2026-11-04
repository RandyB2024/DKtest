"use client";

import { useEffect, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";

type Receipt = {
  id: string;
  filename: string;
  status: string;
  document_type: string;
  created_at: string;
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: "Ontvangen",
    in_review: "In beoordeling",
    needs_customer_action: "Aanvullende informatie nodig",
    ready: "Klaar voor verwerking",
    processed: "Verwerkt",
    archived: "Gearchiveerd",
  };
  return labels[status] ?? "Status onbekend";
}

export default function InventoryReceipts({
  organizationId,
  refreshKey,
}: {
  organizationId: string;
  refreshKey: number;
}) {
  const [items, setItems] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReceipts() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          organizationId,
          scope: "all",
        });

        const response = await fetch(
          `/api/documents?${params.toString()}`,
          {
            credentials: "same-origin",
            cache: "no-store",
          }
        );

        const result = (await response.json()) as {
          items?: Receipt[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            result.error ?? "Aankoopbonnen konden niet worden geladen."
          );
        }

        if (active) {
          setItems(
            (result.items ?? []).filter(
              (item) => item.document_type === "purchase_invoice"
            )
          );
        }
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Aankoopbonnen konden niet worden geladen."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (organizationId !== "all") {
      void loadReceipts();
    }

    return () => {
      active = false;
    };
  }, [organizationId, refreshKey]);

  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <div className="inventory-header">
        <div>
          <span className="inventory-eyebrow">
            AANKOOPDOCUMENTEN
          </span>
          <h2>Geüploade aankoopbonnen</h2>
          <p>
            Aankoopbonnen worden eerst beoordeeld.
            Alleen goedgekeurde bedrijfsmiddelen
            verschijnen in de inventaris.
          </p>
        </div>
        <RefreshCw size={19} aria-hidden="true" />
      </div>

      {loading ? (
        <p>Documenten laden...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : items.length === 0 ? (
        <p>
          Er zijn nog geen aankoopbonnen voor deze
          onderneming geüpload.
        </p>
      ) : (
        <div className="inventory-list">
          {items.map((item) => (
            <article
              className="inventory-row"
              key={item.id}
            >
              <div>
                <small>Aankoopdocument</small>
                <strong>
                  <FileText size={16} aria-hidden="true" />
                  {" "}
                  {item.filename}
                </strong>
                <span>
                  Ontvangen:{" "}
                  {new Date(item.created_at)
                    .toLocaleDateString("nl-NL")}
                </span>
              </div>
              <div>
                <small>Verwerkingsstatus</small>
                <strong>{statusLabel(item.status)}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}