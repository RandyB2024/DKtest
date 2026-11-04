"use client";
import InventoryReceipts from "./inventory-receipts";
import InventoryDisposalAction from "./inventory-disposal-action";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Armchair,
  Boxes,
  Car,
  CircleAlert,
  Laptop,
  PackageSearch,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";


type Category =
  | "all"
  | "vehicle"
  | "equipment"
  | "ict"
  | "furniture"
  | "other";


type Item = {
  id: string;
  category:
    | "vehicle"
    | "equipment"
    | "ict"
    | "furniture"
    | "other";
  name: string;
  description: string | null;
  purchaseDate: string | null;
  purchaseValueCents: number | null;
  bookValueCents: number | null;
  make: string | null;
  model: string | null;
  licensePlate: string | null;
  serialNumber: string | null;
  odometerKm: number | null;
  location: string | null;
  status: string;
  notes: string | null;
};


const categories = [
  ["all", "Alles", Boxes],
  ["vehicle", "Voertuigen", Car],
  ["equipment", "Apparatuur & machines", Wrench],
  ["ict", "ICT & elektronica", Laptop],
  ["furniture", "Meubilair", Armchair],
  ["other", "Overig", PackageSearch],
] as const;


const emptyForm = {
  category:
    "vehicle",
  name:
    "",
  description:
    "",
  purchaseDate:
    "",
  purchaseValue:
    "",
  bookValue:
    "",
  make:
    "",
  model:
    "",
  licensePlate:
    "",
  serialNumber:
    "",
  odometerKm:
    "",
  location:
    "",
  notes:
    "",
};


const euro =
  new Intl.NumberFormat(
    "nl-NL",
    {
      style:
        "currency",
      currency:
        "EUR",
    },
  );


function money(
  cents:
    number |
    null,
) {
  if (
    cents === null
  ) {
    return "—";
  }

  return euro.format(
    cents / 100,
  );
}


function toCents(
  value: string,
) {
  if (!value.trim()) {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");

  const amount =
    Number(
      normalized,
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount < 0
  ) {
    return NaN;
  }

  return Math.round(
    amount * 100,
  );
}


function categoryLabel(
  category: Item["category"],
) {
  return (
    categories.find(
      ([id]) =>
        id === category,
    )?.[1] ??
    category
  );
}


export default function InventoryView({
  context,
  organization,
}: {
  context: PortalContext;
  organization?: PortalOrganization;
}) {
  const [
    items,
    setItems,
  ] =
    useState<Item[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState<Category>(
      "all",
    );

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    formOpen,
    setFormOpen,
  ] =
    useState(false);

  const [
    form,
    setForm,
  ] =
    useState(
      emptyForm,
    );


  // BESTEMD_RECEIPT_UPLOAD_291B
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [receiptRefresh, setReceiptRefresh] = useState(0);

  async function load() {
    if (
      context.organizationId ===
      "all"
    ) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/inventory?organizationId=${encodeURIComponent(
            context.organizationId,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const result =
        (await response.json()) as {
          items?: Item[];
          error?: string;
        };

      if (
        !response.ok
      ) {
        throw new Error(
          result.error ||
          "Inventaris kon niet worden geladen.",
        );
      }

      setItems(
        result.items ?? [],
      );
    } catch (
      caught
    ) {
      setItems([]);

      setError(
        caught instanceof Error
          ? caught.message
          : "Inventaris kon niet worden geladen.",
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(
    () => {
      void load();
    },
    [
      context.organizationId,
    ],
  );


  const visible =
    useMemo(
      () => {
        const search =
          query
            .trim()
            .toLowerCase();

        return items.filter(
          (
            item,
          ) => {
            if (
              category !==
                "all" &&
              item.category !==
                category
            ) {
              return false;
            }

            if (!search) {
              return true;
            }

            return [
              item.name,
              item.make,
              item.model,
              item.licensePlate,
              item.serialNumber,
              item.location,
            ]
              .filter(Boolean)
              .some(
                (value) =>
                  String(value)
                    .toLowerCase()
                    .includes(
                      search,
                    ),
              );
          },
        );
      },
      [
        items,
        category,
        query,
      ],
    );


  const totalPurchase =
    items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        (
          item.purchaseValueCents ??
          0
        ),
      0,
    );


  const totalBook =
    items.reduce(
      (
        sum,
        item,
      ) =>
        sum +
        (
          item.bookValueCents ??
          0
        ),
      0,
    );


  function field(
    name:
      keyof typeof emptyForm,
    value: string,
  ) {
    setForm(
      (
        current,
      ) => ({
        ...current,
        [name]:
          value,
      }),
    );
  }


  async function save(
    event:
      React.FormEvent,
  ) {
    event.preventDefault();

    if (
      context.organizationId ===
      "all"
    ) {
      return;
    }


    const purchaseValue =
      toCents(
        form.purchaseValue,
      );

    const bookValue =
      toCents(
        form.bookValue,
      );


    if (
      Number.isNaN(
        purchaseValue,
      ) ||
      Number.isNaN(
        bookValue,
      )
    ) {
      setError(
        "Controleer de ingevoerde bedragen.",
      );

      return;
    }


    setBusy(true);
    setError("");


    try {
      const response =
        await fetch(
          "/api/inventory",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                organizationId:
                  context.organizationId,

                category:
                  form.category,

                name:
                  form.name,

                description:
                  form.description,

                purchaseDate:
                  form.purchaseDate,

                purchaseValueCents:
                  purchaseValue,

                bookValueCents:
                  bookValue,

                make:
                  form.make,

                model:
                  form.model,

                licensePlate:
                  form.licensePlate,

                serialNumber:
                  form.serialNumber,

                odometerKm:
                  form.odometerKm
                    ? Number(
                        form.odometerKm,
                      )
                    : null,

                location:
                  form.location,

                notes:
                  form.notes,
              }),
          },
        );


      const result =
        (await response.json()) as {
          itemId?: string;
          error?: string;
        };


      if (
        !response.ok
      ) {
        throw new Error(
          result.error ||
          "Bedrijfsmiddel kon niet worden toegevoegd.",
        );
      }


      setForm(
        emptyForm,
      );

      setFormOpen(
        false,
      );

      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Bedrijfsmiddel kon niet worden toegevoegd.",
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
      <>
        <div className="heading">
          <div>
            <h1>
              Inventaris
            </h1>

            <p>
              Selecteer eerst één onderneming.
            </p>
          </div>
        </div>

        <section className="card">
          <div className="notice">
            Inventaris wordt altijd strikt
            per onderneming bijgehouden.
          </div>
        </section>
      </>
    );
  }


  return (
    <div className="inventory-page">

      <section className="inventory-header">
        <div>
          <span className="inventory-eyebrow">
            Bedrijfsmiddelen
          </span>

          <h1>
            Inventaris
          </h1>

          <p>
            Alle bedrijfsmiddelen van{" "}
            <strong>
              {organization?.name ??
                "jouw onderneming"}
            </strong>
            .
          </p>
        </div>

        <button
          type="button"
          className="btn primary inventory-add-button"
          onClick={() => {
            setFormOpen(true);
          }}
        >
          Aankoopbon uploaden
        </button>
      </section>


      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}


      <InventoryReceipts
        organizationId={context.organizationId}
        refreshKey={receiptRefresh}
      />

      <section className="inventory-summary">

        <article className="inventory-summary-card">
          <div className="inventory-summary-icon">
            <Boxes />
          </div>

          <div>
            <span>
              Bedrijfsmiddelen
            </span>

            <strong>
              {items.length}
            </strong>

            <small>
              Totaal geregistreerd
            </small>
          </div>
        </article>


        <article className="inventory-summary-card">
          <div className="inventory-summary-icon">
            <Car />
          </div>

          <div>
            <span>
              Voertuigen
            </span>

            <strong>
              {
                items.filter(
                  (
                    item,
                  ) =>
                    item.category ===
                    "vehicle",
                ).length
              }
            </strong>

            <small>
              Geregistreerde voertuigen
            </small>
          </div>
        </article>


        <article className="inventory-summary-card">
          <div className="inventory-summary-icon">
            <Wrench />
          </div>

          <div>
            <span>
              Aanschafwaarde
            </span>

            <strong>
              {money(
                totalPurchase,
              )}
            </strong>

            <small>
              Totaal geregistreerd
            </small>
          </div>
        </article>


        <article className="inventory-summary-card">
          <div className="inventory-summary-icon">
            <CircleAlert />
          </div>

          <div>
            <span>
              Boekwaarde
            </span>

            <strong>
              {money(
                totalBook,
              )}
            </strong>

            <small>
              Huidige boekwaarde
            </small>
          </div>
        </article>

      </section>


      <section className="card inventory-main-card">

        <div className="inventory-section-head">
          <div>
            <h2>
              Bedrijfsmiddelen
            </h2>

            <p>
              Zoek en filter de inventaris.
            </p>
          </div>
        </div>


        <div className="inventory-category-tabs">
          {categories.map(
            (
              [
                id,
                label,
                Icon,
              ],
            ) => (
              <button
                key={id}
                type="button"
                className={
                  category === id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setCategory(
                    id,
                  )
                }
              >
                <Icon size={16} />
                {label}
              </button>
            ),
          )}
        </div>


        <div className="inventory-toolbar">
          <label className="inventory-search">
            <Search size={17} />

            <input
              value={query}
              onChange={(
                event,
              ) =>
                setQuery(
                  event.target.value,
                )
              }
              placeholder="Zoek op naam, kenteken, serienummer, merk of locatie"
            />
          </label>
        </div>


        {loading ? (
          <div className="inventory-empty">
            Inventaris wordt geladen...
          </div>
        ) : visible.length ===
          0 ? (
          <div className="inventory-empty">
            <PackageSearch />

            <strong>
              Geen bedrijfsmiddelen gevonden
            </strong>

            <p>
              Upload een aankoopbon of factuur
              om de inventaris op te bouwen.
            </p>
          </div>
        ) : (
          <div className="inventory-list">

            {visible.map(
              (
                item,
              ) => (
                <article
                  key={item.id}
                  className="inventory-row"
                >
                  <div>
                    <small>
                      {
                        categoryLabel(
                          item.category,
                        )
                      }
                    </small>

                    <strong>
                      {item.name}
                    </strong>

                    <span>
                      {
                        [
                          item.make,
                          item.model,
                          item.licensePlate,
                          item.serialNumber,
                        ]
                          .filter(
                            Boolean,
                          )
                          .join(
                            " · ",
                          ) ||
                        "Geen aanvullende kenmerken"
                      }
                    </span>
                  </div>

                  <div>
                    <small>
                      Aanschafwaarde
                    </small>

                    <strong>
                      {money(
                        item.purchaseValueCents,
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>
                      Boekwaarde
                    </small>

                    <strong>
                      {money(
                        item.bookValueCents,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span className="status ok">{item.status === "active" ? "Actief" : item.status}</span>
                    {item.status === "active" && (
                      <InventoryDisposalAction
                        organizationId={context.organizationId}
                        itemId={item.id}
                      />
                    )}
                  </div>
                </article>
              ),
            )}

          </div>
        )}

      </section>


      {formOpen && (
        <div className="inventory-modal-backdrop">
          <div className="inventory-modal">
            <div className="inventory-modal-head">
              <div>
                <small>AANKOOPDOCUMENT</small>
                <h2>Aankoopbon uploaden</h2>
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setFormOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="inventory-form">
              <p>
                Upload een aankoopbon of factuur als PDF,
                JPG of PNG.
              </p>

              <label className="inventory-form-wide">
                Aankoopbon of factuur
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) =>
                    setReceiptFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>

              <div className="inventory-form-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setFormOpen(false)}
                >
                  Annuleren
                </button>

                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !receiptFile}
                  onClick={async () => {
                    if (!receiptFile) return;

                    if (![
                      "application/pdf",
                      "image/jpeg",
                      "image/png",
                    ].includes(receiptFile.type)) {
                      setError("Alleen PDF, JPG en PNG zijn toegestaan.");
                      return;
                    }

                    if (receiptFile.size > 50 * 1024 * 1024) {
                      setError("Het bestand mag maximaal 50 MB zijn.");
                      return;
                    }

                    setBusy(true);
                    setError("");
                    setUploadMessage("");

                    try {
                      const data = new FormData();
                      data.append("organizationId", context.organizationId);
                      data.append("documentType", "purchase_invoice");
                      data.append("file", receiptFile);

                      const response = await fetch("/api/documents", {
                        method: "POST",
                        credentials: "same-origin",
                        body: data,
                      });

                      const result = (await response.json()) as {
                        item?: { id: string };
                        error?: string;
                      };

                      if (!response.ok) {
                        throw new Error(
                          result.error || "Upload mislukt."
                        );
                      }

                      setReceiptFile(null);
                      setReceiptRefresh((current) => current + 1);
                      setFormOpen(false);
                      setUploadMessage(
                        "Aankoopbon opgeslagen. " +
                        "Wize-analyse wordt nog aangesloten."
                      );
                    } catch (caught) {
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : "Upload mislukt."
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Uploaden..." : "Aankoopbon uploaden"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {uploadMessage && (
        <div className="notice" role="status">
          {uploadMessage}
        </div>
      )}

    </div>
  );
}
