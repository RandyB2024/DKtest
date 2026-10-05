"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FilePlus2,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from "lucide-react";

import type {
  PortalContext,
} from "@/lib/portal-access";


type Debtor = {
  id: string;
  name: string;
  email: string;
};


type DraftLine = {
  id?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatCode:
    | "21"
    | "9"
    | "0"
    | "exempt";
};


type Draft = {
  id: string;

  invoiceDate: string;
  dueDate: string;

  customerReference:
    | string
    | null;

  notes:
    | string
    | null;

  subtotalCents: number;
  vatCents: number;
  totalCents: number;

  debtor: {
    id: string;
    name: string;
    email: string;
  };

  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    vatCode:
      | "21"
      | "9"
      | "0"
      | "exempt";
    position: number;
  }>;
};


type ApiResponse = {
  error?: string;
  drafts?: Draft[];
  debtors?: Debtor[];
  invoiceId?: string;
};


type Props = {
  context: PortalContext;
};


function newLine(): DraftLine {
  return {
    description: "",
    quantity: "1",
    unitPrice: "",
    vatCode: "21",
  };
}


function today() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function euro(
  cents: number,
) {
  return new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
    },
  ).format(
    cents / 100,
  );
}


function priceToCents(
  value: string,
) {
  const normalized =
    value
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");

  const amount =
    Number(normalized);

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return null;
  }

  return Math.round(
    amount * 100,
  );
}


function vatRate(
  code: DraftLine["vatCode"],
) {
  switch (code) {
    case "21":
      return 21;

    case "9":
      return 9;

    default:
      return 0;
  }
}


export default function InvoiceDraftManager({
  context,
}: Props) {
  const [drafts, setDrafts] =
    useState<Draft[]>([]);

  const [debtors, setDebtors] =
    useState<Debtor[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [open, setOpen] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [debtorId, setDebtorId] =
    useState("");

  const [invoiceDate, setInvoiceDate] =
    useState(today());

  const [
    customerReference,
    setCustomerReference,
  ] = useState("");

  const [notes, setNotes] =
    useState("");

  const [lines, setLines] =
    useState<DraftLine[]>([
      newLine(),
    ]);


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
      const [
        draftResponse,
        debtorResponse,
      ] = await Promise.all([
        fetch(
          `/api/invoicing/invoices?organizationId=${encodeURIComponent(
            context.organizationId,
          )}`,
          {
            cache: "no-store",
          },
        ),

        fetch(
          `/api/invoicing/debtors?organizationId=${encodeURIComponent(
            context.organizationId,
          )}`,
          {
            cache: "no-store",
          },
        ),
      ]);


      const draftResult =
        (await draftResponse.json()) as ApiResponse;

      const debtorResult =
        (await debtorResponse.json()) as ApiResponse;


      if (!draftResponse.ok) {
        throw new Error(
          draftResult.error ||
          "Conceptfacturen konden niet worden geladen.",
        );
      }


      if (!debtorResponse.ok) {
        throw new Error(
          debtorResult.error ||
          "Debiteuren konden niet worden geladen.",
        );
      }


      setDrafts(
        draftResult.drafts ?? [],
      );

      setDebtors(
        debtorResult.debtors ?? [],
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Facturatie kon niet worden geladen.",
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void load();
  }, [
    context.organizationId,
  ]);


  function reset() {
    setEditingId(null);
    setDebtorId("");
    setInvoiceDate(
      today(),
    );
    setCustomerReference("");
    setNotes("");
    setLines([
      newLine(),
    ]);
    setError("");
  }


  function startNew() {
    reset();
    setOpen(true);
  }


  function editDraft(
    draft: Draft,
  ) {
    setEditingId(
      draft.id,
    );

    setDebtorId(
      draft.debtor.id,
    );

    setInvoiceDate(
      draft.invoiceDate,
    );

    setCustomerReference(
      draft.customerReference ??
      "",
    );

    setNotes(
      draft.notes ??
      "",
    );

    setLines(
      draft.lines.map(
        (line) => ({
          id:
            line.id,

          description:
            line.description,

          quantity:
            String(
              line.quantity,
            ),

          unitPrice:
            (
              line.unitPriceCents /
              100
            )
              .toFixed(2)
              .replace(".", ","),

          vatCode:
            line.vatCode,
        }),
      ),
    );

    setError("");
    setOpen(true);
  }


  function updateLine(
    index: number,
    patch:
      Partial<DraftLine>,
  ) {
    setLines(
      (current) =>
        current.map(
          (line, position) =>
            position === index
              ? {
                  ...line,
                  ...patch,
                }
              : line,
        ),
    );
  }


  function addLine() {
    setLines(
      (current) => [
        ...current,
        newLine(),
      ],
    );
  }


  function removeLine(
    index: number,
  ) {
    setLines(
      (current) => {
        if (
          current.length === 1
        ) {
          return current;
        }

        return current.filter(
          (_, position) =>
            position !== index,
        );
      },
    );
  }


  const totals =
    useMemo(() => {
      let subtotalCents = 0;
      let vatCents = 0;


      for (
        const line of
          lines
      ) {
        const quantity =
          Number(
            line.quantity
              .replace(",", "."),
          );

        const unitPriceCents =
          priceToCents(
            line.unitPrice,
          );


        if (
          !Number.isFinite(
            quantity,
          ) ||
          quantity <= 0 ||
          unitPriceCents === null
        ) {
          continue;
        }


        const net =
          Math.round(
            quantity *
            unitPriceCents,
          );

        const vat =
          Math.round(
            net *
            vatRate(
              line.vatCode,
            ) /
            100,
          );


        subtotalCents +=
          net;

        vatCents +=
          vat;
      }


      return {
        subtotalCents,
        vatCents,

        totalCents:
          subtotalCents +
          vatCents,
      };
    }, [
      lines,
    ]);


  async function save(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      context.organizationId ===
      "all"
    ) {
      return;
    }

    if (!debtorId) {
      setError(
        "Kies eerst een debiteur.",
      );
      return;
    }


    const apiLines =
      lines.map(
        (line, index) => {
          const quantity =
            Number(
              line.quantity
                .replace(",", "."),
            );

          const unitPriceCents =
            priceToCents(
              line.unitPrice,
            );


          if (
            !line.description.trim()
          ) {
            throw new Error(
              `Vul een omschrijving in bij regel ${index + 1}.`,
            );
          }


          if (
            !Number.isFinite(
              quantity,
            ) ||
            quantity <= 0
          ) {
            throw new Error(
              `Aantal van regel ${index + 1} is ongeldig.`,
            );
          }


          if (
            unitPriceCents ===
            null
          ) {
            throw new Error(
              `Prijs van regel ${index + 1} is ongeldig.`,
            );
          }


          return {
            description:
              line.description.trim(),

            quantity,

            unitPriceCents,

            vatCode:
              line.vatCode,
          };
        },
      );


    setBusy(true);
    setError("");


    try {
      const response =
        await fetch(
          "/api/invoicing/invoices",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  editingId
                    ? "update"
                    : "create",

                organizationId:
                  context.organizationId,

                invoiceId:
                  editingId,

                debtorId,

                invoiceDate,

                customerReference,

                notes,

                lines:
                  apiLines,
              }),
          },
        );


      const result =
        (await response.json()) as ApiResponse;


      if (!response.ok) {
        throw new Error(
          result.error ||
          "Conceptfactuur kon niet worden opgeslagen.",
        );
      }


      setOpen(false);
      reset();

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Conceptfactuur kon niet worden opgeslagen.",
      );
    } finally {
      setBusy(false);
    }
  }


  async function deleteDraft(
    draft: Draft,
  ) {
    if (
      context.organizationId ===
      "all"
    ) {
      return;
    }


    if (
      !window.confirm(
        "Conceptfactuur verwijderen?",
      )
    ) {
      return;
    }


    setBusy(true);
    setError("");


    try {
      const response =
        await fetch(
          "/api/invoicing/invoices",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "delete",

                organizationId:
                  context.organizationId,

                invoiceId:
                  draft.id,
              }),
          },
        );


      const result =
        (await response.json()) as ApiResponse;


      if (!response.ok) {
        throw new Error(
          result.error ||
          "Conceptfactuur kon niet worden verwijderd.",
        );
      }


      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Conceptfactuur kon niet worden verwijderd.",
      );
    } finally {
      setBusy(false);
    }
  }


  if (
    context.organizationId ===
    "all"
  ) {
    return (
      <section className="card">
        <div className="notice">
          Selecteer één onderneming
          om facturen te maken.
        </div>
      </section>
    );
  }


  return (
    <section className="card invoice-draft-manager">

      <div className="section-heading invoice-draft-head">
        <div>
          <h2>
            Facturen maken
          </h2>

          <p>
            Maak en beheer
            verkoopfacturen voordat
            je ze definitief verstuurt.
          </p>
        </div>

        <button
          type="button"
          className="btn primary"
          onClick={startNew}
        >
          <FilePlus2 size={16} />
          Nieuwe factuur
        </button>
      </div>


      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}


      {loading ? (
        <p>
          Conceptfacturen worden geladen...
        </p>
      ) : drafts.length === 0 ? (
        <div className="invoice-draft-empty">
          <ReceiptText />

          <strong>
            Geen conceptfacturen
          </strong>

          <span>
            Maak een nieuwe factuur
            om te beginnen.
          </span>
        </div>
      ) : (
        <div className="invoice-draft-list">
          {drafts.map(
            (draft) => (
              <article
                key={draft.id}
                className="invoice-draft-card"
              >
                <div>
                  <small>
                    CONCEPT
                  </small>

                  <strong>
                    {
                      draft.debtor
                        .name
                    }
                  </strong>

                  <span>
                    Factuurdatum{" "}
                    {
                      draft.invoiceDate
                    }
                  </span>
                </div>


                <div>
                  <small>
                    Totaal
                  </small>

                  <strong>
                    {euro(
                      draft.totalCents,
                    )}
                  </strong>
                </div>


                <div className="invoice-draft-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      editDraft(
                        draft,
                      )
                    }
                  >
                    <Pencil size={14} />
                    Bewerken
                  </button>

                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      deleteDraft(
                        draft,
                      )
                    }
                  >
                    <Trash2 size={14} />
                    Verwijderen
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      )}


      {open && (
        <div className="invoice-builder-backdrop">
          <div className="invoice-builder">

            <header className="invoice-builder-head">
              <div>
                <small>
                  VERKOOPFACTUUR
                </small>

                <h2>
                  {editingId
                    ? "Conceptfactuur bewerken"
                    : "Nieuwe factuur"}
                </h2>
              </div>

              <button
                type="button"
                className="btn"
                onClick={() =>
                  setOpen(false)
                }
              >
                <X size={17} />
              </button>
            </header>


            <form
              onSubmit={save}
              className="invoice-builder-form"
            >

              <section className="invoice-builder-meta">

                <label>
                  Debiteur *

                  <select
                    required
                    value={debtorId}
                    onChange={(event) =>
                      setDebtorId(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Kies debiteur
                    </option>

                    {debtors.map(
                      (debtor) => (
                        <option
                          key={
                            debtor.id
                          }
                          value={
                            debtor.id
                          }
                        >
                          {
                            debtor.name
                          }
                        </option>
                      ),
                    )}
                  </select>
                </label>


                <label>
                  Factuurdatum *

                  <input
                    required
                    type="date"
                    value={
                      invoiceDate
                    }
                    onChange={(event) =>
                      setInvoiceDate(
                        event.target.value,
                      )
                    }
                  />
                </label>


                <label>
                  Referentie

                  <input
                    maxLength={120}
                    value={
                      customerReference
                    }
                    onChange={(event) =>
                      setCustomerReference(
                        event.target.value,
                      )
                    }
                    placeholder="Bijv. project of ordernummer"
                  />
                </label>

              </section>


              <section className="invoice-builder-lines">

                <div className="section-heading">
                  <div>
                    <h3>
                      Factuurregels
                    </h3>

                    <p>
                      Voeg producten of
                      diensten toe.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={addLine}
                  >
                    <Plus size={15} />
                    Regel toevoegen
                  </button>
                </div>


                {lines.map(
                  (
                    line,
                    index,
                  ) => (
                    <div
                      key={
                        line.id ??
                        index
                      }
                      className="invoice-builder-line"
                    >

                      <label className="invoice-line-description">
                        Omschrijving

                        <input
                          required
                          maxLength={500}
                          value={
                            line.description
                          }
                          onChange={(event) =>
                            updateLine(
                              index,
                              {
                                description:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </label>


                      <label>
                        Aantal

                        <input
                          required
                          inputMode="decimal"
                          value={
                            line.quantity
                          }
                          onChange={(event) =>
                            updateLine(
                              index,
                              {
                                quantity:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </label>


                      <label>
                        Prijs excl. btw

                        <input
                          required
                          inputMode="decimal"
                          placeholder="0,00"
                          value={
                            line.unitPrice
                          }
                          onChange={(event) =>
                            updateLine(
                              index,
                              {
                                unitPrice:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </label>


                      <label>
                        Btw

                        <select
                          value={
                            line.vatCode
                          }
                          onChange={(event) =>
                            updateLine(
                              index,
                              {
                                vatCode:
                                  event.target.value as DraftLine["vatCode"],
                              },
                            )
                          }
                        >
                          <option value="21">
                            21%
                          </option>

                          <option value="9">
                            9%
                          </option>

                          <option value="0">
                            0%
                          </option>

                          <option value="exempt">
                            Vrijgesteld
                          </option>
                        </select>
                      </label>


                      <button
                        type="button"
                        className="invoice-line-delete"
                        aria-label="Factuurregel verwijderen"
                        disabled={
                          lines.length ===
                          1
                        }
                        onClick={() =>
                          removeLine(
                            index,
                          )
                        }
                      >
                        <Trash2
                          size={16}
                        />
                      </button>

                    </div>
                  ),
                )}

              </section>


              <section className="invoice-builder-bottom">

                <label>
                  Notitie op factuur

                  <textarea
                    maxLength={2000}
                    value={notes}
                    onChange={(event) =>
                      setNotes(
                        event.target.value,
                      )
                    }
                    placeholder="Optionele toelichting"
                  />
                </label>


                <div className="invoice-builder-totals">
                  <div>
                    <span>
                      Subtotaal
                    </span>

                    <strong>
                      {euro(
                        totals.subtotalCents,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Btw
                    </span>

                    <strong>
                      {euro(
                        totals.vatCents,
                      )}
                    </strong>
                  </div>

                  <div className="invoice-builder-grand-total">
                    <span>
                      Totaal
                    </span>

                    <strong>
                      {euro(
                        totals.totalCents,
                      )}
                    </strong>
                  </div>
                </div>

              </section>


              <footer className="invoice-builder-actions">

                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    setOpen(false)
                  }
                >
                  Annuleren
                </button>

                <button
                  type="submit"
                  className="btn primary"
                  disabled={busy}
                >
                  {busy
                    ? "Opslaan..."
                    : "Opslaan als concept"}
                </button>

              </footer>

            </form>
          </div>
        </div>
      )}

    </section>
  );
}
