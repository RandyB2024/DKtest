"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Building2,
  Car,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";


type ItemType =
  | "asset"
  | "liability";


type WealthItem = {
  id: string;
  itemType: ItemType;
  category: string;
  name: string;
  institution: string | null;
  currentValueCents: number;
  referenceDate: string;
  notes: string | null;
  position: number;
  updatedAt: string | null;
};


type WealthResponse = {
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  items: WealthItem[];
};


const emptyResponse: WealthResponse = {
  assetsCents: 0,
  liabilitiesCents: 0,
  netWorthCents: 0,
  items: [],
};


const assetCategories = [
  ["cash", "Contant"],
  ["savings", "Spaargeld"],
  ["investments", "Beleggingen"],
  ["pension", "Pensioen"],
  ["property", "Woning / vastgoed"],
  ["vehicle", "Voertuigen"],
  ["business", "Onderneming"],
  ["other", "Overig"],
] as const;


const liabilityCategories = [
  ["mortgage", "Hypotheek"],
  ["loan", "Lening"],
  ["tax", "Belastingschuld"],
  ["credit", "Krediet"],
  ["other", "Overig"],
] as const;


function euro(
  cents: number,
) {
  return new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    },
  ).format(
    cents / 100,
  );
}


function centsToInput(
  cents: number,
) {
  if (!cents) {
    return "";
  }

  return (
    cents / 100
  ).toString();
}


function inputToCents(
  input: string,
) {
  const normalized =
    input
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");

  const value =
    Number(normalized);

  if (
    !Number.isFinite(value)
    || value < 0
  ) {
    return null;
  }

  return Math.round(
    value * 100,
  );
}


function categoryLabel(
  value: string,
) {
  const all = [
    ...assetCategories,
    ...liabilityCategories,
  ];

  return (
    all.find(
      ([key]) =>
        key === value,
    )?.[1] ??
    "Overig"
  );
}


function itemIcon(
  category: string,
) {
  if (
    category === "property" ||
    category === "business"
  ) {
    return Building2;
  }

  if (
    category === "vehicle"
  ) {
    return Car;
  }

  if (
    category === "savings" ||
    category === "cash"
  ) {
    return PiggyBank;
  }

  if (
    category === "investments" ||
    category === "pension"
  ) {
    return TrendingUp;
  }

  if (
    category === "mortgage" ||
    category === "loan"
  ) {
    return Landmark;
  }

  return WalletCards;
}


export default function PersonalWealth() {
  const [
    data,
    setData,
  ] =
    useState<WealthResponse>(
      emptyResponse,
    );

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
    message,
    setMessage,
  ] =
    useState("");

  const [
    editingId,
    setEditingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    itemType,
    setItemType,
  ] =
    useState<ItemType>(
      "asset",
    );

  const [
    category,
    setCategory,
  ] =
    useState("savings");

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    institution,
    setInstitution,
  ] =
    useState("");

  const [
    amount,
    setAmount,
  ] =
    useState("");

  const [
    referenceDate,
    setReferenceDate,
  ] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10),
    );

  const [
    notes,
    setNotes,
  ] =
    useState("");


  const assets =
    useMemo(
      () =>
        data.items.filter(
          item =>
            item.itemType ===
            "asset",
        ),
      [data.items],
    );


  const liabilities =
    useMemo(
      () =>
        data.items.filter(
          item =>
            item.itemType ===
            "liability",
        ),
      [data.items],
    );


  useEffect(() => {
    void load();
  }, []);


  useEffect(() => {
    const allowed =
      itemType === "asset"
        ? assetCategories
        : liabilityCategories;

    if (
      !allowed.some(
        ([value]) =>
          value === category,
      )
    ) {
      setCategory(
        allowed[0][0],
      );
    }

  }, [
    itemType,
    category,
  ]);


  async function load() {
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/personal/wealth",
          {
            cache: "no-store",
          },
        );

      const body =
        await response.json() as
          WealthResponse & {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Jouw vermogen kon niet worden geladen.",
        );
      }

      setData({
        ...emptyResponse,
        ...body,

        items:
          Array.isArray(
            body.items,
          )
            ? body.items
            : [],
      });

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Jouw vermogen kon niet worden geladen.",
      );

    } finally {
      setLoading(false);
    }
  }


  function resetForm() {
    setEditingId(null);
    setItemType("asset");
    setCategory("savings");
    setName("");
    setInstitution("");
    setAmount("");

    setReferenceDate(
      new Date()
        .toISOString()
        .slice(0, 10),
    );

    setNotes("");
  }


  function editItem(
    item: WealthItem,
  ) {
    setEditingId(
      item.id,
    );

    setItemType(
      item.itemType,
    );

    setCategory(
      item.category,
    );

    setName(
      item.name,
    );

    setInstitution(
      item.institution ??
      "",
    );

    setAmount(
      centsToInput(
        item.currentValueCents,
      ),
    );

    setReferenceDate(
      item.referenceDate,
    );

    setNotes(
      item.notes ??
      "",
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }


  async function saveItem() {
    const cents =
      inputToCents(
        amount,
      );

    if (!name.trim()) {
      setError(
        "Geef de vermogenspost een naam.",
      );
      return;
    }

    if (cents === null) {
      setError(
        "Vul een geldig bedrag in.",
      );
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/personal/wealth",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "save",

                itemId:
                  editingId,

                item: {
                  itemType,
                  category,

                  name:
                    name.trim(),

                  institution:
                    institution.trim() ||
                    null,

                  currentValueCents:
                    cents,

                  referenceDate,

                  notes:
                    notes.trim() ||
                    null,

                  position:
                    editingId
                      ? (
                          data.items.find(
                            item =>
                              item.id ===
                              editingId,
                          )?.position ??
                          0
                        )
                      : data.items.length,
                },
              }),
          },
        );

      const body =
        await response.json() as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Opslaan is niet gelukt.",
        );
      }

      resetForm();

      await load();

      setMessage(
        editingId
          ? "Vermogenspost bijgewerkt."
          : "Vermogenspost toegevoegd.",
      );

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Opslaan is niet gelukt.",
      );

    } finally {
      setBusy(false);
    }
  }


  async function deleteItem(
    itemId: string,
  ) {
    if (
      !window.confirm(
        "Wil je deze vermogenspost verwijderen?",
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/personal/wealth",
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

                itemId,
              }),
          },
        );

      const body =
        await response.json() as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Verwijderen is niet gelukt.",
        );
      }

      if (
        editingId ===
        itemId
      ) {
        resetForm();
      }

      await load();

      setMessage(
        "Vermogenspost verwijderd.",
      );

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Verwijderen is niet gelukt.",
      );

    } finally {
      setBusy(false);
    }
  }


  function renderItem(
    item: WealthItem,
  ) {
    const Icon =
      itemIcon(
        item.category,
      );

    return (
      <article
        key={item.id}
        className="personal-wealth-row"
      >

        <div className="personal-wealth-row-icon">
          <Icon />
        </div>


        <div className="personal-wealth-row-main">

          <div className="personal-wealth-row-title">

            <div>
              <strong>
                {item.name}
              </strong>

              <span>
                {categoryLabel(
                  item.category,
                )}

                {item.institution
                  ? ` · ${item.institution}`
                  : ""}
              </span>
            </div>


            <strong className="personal-wealth-row-value">
              {euro(
                item.currentValueCents,
              )}
            </strong>

          </div>


          <div className="personal-wealth-row-meta">

            <span>
              Peildatum{" "}
              {new Date(
                `${item.referenceDate}T00:00:00`,
              ).toLocaleDateString(
                "nl-NL",
              )}
            </span>

            {item.notes && (
              <span>
                {item.notes}
              </span>
            )}

          </div>

        </div>


        <div className="personal-wealth-row-actions">

          <button
            type="button"
            aria-label="Bewerken"
            onClick={() =>
              editItem(
                item,
              )
            }
          >
            <Pencil />
          </button>

          <button
            type="button"
            aria-label="Verwijderen"
            onClick={() =>
              deleteItem(
                item.id,
              )
            }
          >
            <Trash2 />
          </button>

        </div>

      </article>
    );
  }


  if (loading) {
    return (
      <section className="personal-module-empty">
        Jouw vermogen wordt geladen…
      </section>
    );
  }


  return (
    <div className="personal-wealth-page">

      <header className="personal-wealth-heading">

        <div>
          <span className="personal-area-label">
            MIJN BESTEMMING
          </span>

          <h1>
            Mijn vermogen
          </h1>

          <p>
            Zie wat je bezit, welke verplichtingen
            je hebt en hoe jouw nettovermogen is opgebouwd.
          </p>
        </div>

      </header>


      <section className="personal-wealth-summary">

        <article>

          <span>
            Bezittingen
          </span>

          <strong>
            {euro(
              data.assetsCents,
            )}
          </strong>

          <small>
            Totale huidige waarde
          </small>

        </article>


        <article>

          <span>
            Verplichtingen
          </span>

          <strong>
            {euro(
              data.liabilitiesCents,
            )}
          </strong>

          <small>
            Totale openstaande waarde
          </small>

        </article>


        <article className="personal-wealth-net">

          <span>
            Nettovermogen
          </span>

          <strong>
            {euro(
              data.netWorthCents,
            )}
          </strong>

          <small>
            Bezittingen minus verplichtingen
          </small>

        </article>

      </section>


      {error && (
        <div
          className="personal-form-error"
          role="alert"
        >
          {error}
        </div>
      )}


      {message && (
        <div
          className="personal-form-success"
          role="status"
        >
          {message}
        </div>
      )}


      <section className="personal-wealth-layout">

        <article className="personal-wealth-form-card">

          <div className="personal-wealth-form-title">

            <Plus />

            <div>

              <span className="personal-area-label">
                {editingId
                  ? "BEWERKEN"
                  : "TOEVOEGEN"}
              </span>

              <h2>
                {editingId
                  ? "Vermogenspost aanpassen"
                  : "Nieuwe vermogenspost"}
              </h2>

            </div>

          </div>


          <div className="personal-wealth-type-toggle">

            <button
              type="button"
              className={
                itemType ===
                "asset"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setItemType(
                  "asset",
                )
              }
            >
              Bezitting
            </button>


            <button
              type="button"
              className={
                itemType ===
                "liability"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setItemType(
                  "liability",
                )
              }
            >
              Verplichting
            </button>

          </div>


          <label className="field">
            <span>
              Naam
            </span>

            <input
              value={name}
              onChange={event =>
                setName(
                  event.target.value,
                )
              }
              placeholder={
                itemType === "asset"
                  ? "Bijvoorbeeld: Spaarrekening"
                  : "Bijvoorbeeld: Hypotheek woning"
              }
            />
          </label>


          <label className="field">

            <span>
              Categorie
            </span>

            <select
              value={category}
              onChange={event =>
                setCategory(
                  event.target.value,
                )
              }
            >

              {(itemType === "asset"
                ? assetCategories
                : liabilityCategories
              ).map(
                ([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                ),
              )}

            </select>

          </label>


          <label className="field">

            <span>
              Bank, aanbieder of instelling
            </span>

            <input
              value={institution}
              onChange={event =>
                setInstitution(
                  event.target.value,
                )
              }
              placeholder="Optioneel"
            />

          </label>


          <label className="field">

            <span>
              Huidige waarde
            </span>

            <div className="personal-money-input">

              <span>
                €
              </span>

              <input
                inputMode="decimal"
                value={amount}
                onChange={event =>
                  setAmount(
                    event.target.value,
                  )
                }
                placeholder="0"
              />

            </div>

          </label>


          <label className="field">

            <span>
              Peildatum
            </span>

            <input
              type="date"
              value={referenceDate}
              onChange={event =>
                setReferenceDate(
                  event.target.value,
                )
              }
            />

          </label>


          <label className="field">

            <span>
              Notitie
            </span>

            <textarea
              value={notes}
              onChange={event =>
                setNotes(
                  event.target.value,
                )
              }
              placeholder="Optioneel"
            />

          </label>


          <div className="personal-wealth-form-actions">

            <button
              type="button"
              className="personal-primary-button"
              disabled={busy}
              onClick={saveItem}
            >
              {editingId
                ? "Wijzigingen opslaan"
                : "Vermogenspost toevoegen"}
            </button>


            {editingId && (
              <button
                type="button"
                className="personal-secondary-button"
                onClick={
                  resetForm
                }
              >
                Annuleren
              </button>
            )}

          </div>

        </article>


        <div className="personal-wealth-lists">

          <section className="personal-wealth-list-card">

            <header>
              <div>
                <span className="personal-area-label">
                  BEZITTINGEN
                </span>

                <h2>
                  Wat heb je opgebouwd?
                </h2>
              </div>

              <strong>
                {euro(
                  data.assetsCents,
                )}
              </strong>
            </header>


            <div className="personal-wealth-list">

              {assets.length === 0 ? (
                <p className="personal-wealth-empty">
                  Nog geen bezittingen toegevoegd.
                </p>
              ) : (
                assets.map(
                  renderItem,
                )
              )}

            </div>

          </section>


          <section className="personal-wealth-list-card">

            <header>
              <div>
                <span className="personal-area-label">
                  VERPLICHTINGEN
                </span>

                <h2>
                  Wat staat daar tegenover?
                </h2>
              </div>

              <strong>
                {euro(
                  data.liabilitiesCents,
                )}
              </strong>
            </header>


            <div className="personal-wealth-list">

              {liabilities.length === 0 ? (
                <p className="personal-wealth-empty">
                  Nog geen verplichtingen toegevoegd.
                </p>
              ) : (
                liabilities.map(
                  renderItem,
                )
              )}

            </div>

          </section>

        </div>

      </section>

    </div>
  );
}
