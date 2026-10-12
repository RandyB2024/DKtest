"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowRight,
  CircleDollarSign,
  Landmark,
  PiggyBank,
  Save,
  Sparkles,
  WalletCards,
} from "lucide-react";


type AbcData = {
  monthlyIncomeCents: number;
  monthlyExpensesCents: number;

  currentBufferCents: number;
  unforeseenBufferTargetCents: number;
  bridgeBufferTargetCents: number;

  currentCreationCents: number;
  creationTargetCents: number;

  creationGoalDate: string | null;

  notes: string | null;

  updatedAt: string | null;
};


const initialData: AbcData = {
  monthlyIncomeCents: 0,
  monthlyExpensesCents: 0,

  currentBufferCents: 0,
  unforeseenBufferTargetCents: 0,
  bridgeBufferTargetCents: 0,

  currentCreationCents: 0,
  creationTargetCents: 0,

  creationGoalDate: null,

  notes: null,

  updatedAt: null,
};


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


function inputValue(
  cents: number,
) {
  if (!cents) {
    return "";
  }

  return (
    cents / 100
  ).toString();
}


function toCents(
  value: string,
) {
  const normalized =
    value
      .trim()
      .replace(/\./g, "")
      .replace(",", ".");

  if (!normalized) {
    return 0;
  }

  const parsed =
    Number(normalized);

  if (
    !Number.isFinite(parsed)
    || parsed < 0
  ) {
    return null;
  }

  return Math.round(
    parsed * 100,
  );
}


function progress(
  current: number,
  target: number,
) {
  if (target <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (
          current /
          target
        ) * 100,
      ),
    ),
  );
}


export default function PersonalAbc() {
  const [
    data,
    setData,
  ] =
    useState<AbcData>(
      initialData,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
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


  const balance =
    useMemo(
      () =>
        data.monthlyIncomeCents -
        data.monthlyExpensesCents,
      [
        data.monthlyIncomeCents,
        data.monthlyExpensesCents,
      ],
    );


  const totalBufferTarget =
    useMemo(
      () =>
        data.unforeseenBufferTargetCents +
        data.bridgeBufferTargetCents,
      [
        data.unforeseenBufferTargetCents,
        data.bridgeBufferTargetCents,
      ],
    );


  const bufferProgress =
    progress(
      data.currentBufferCents,
      totalBufferTarget,
    );


  const creationProgress =
    progress(
      data.currentCreationCents,
      data.creationTargetCents,
    );


  useEffect(() => {
    void load();
  }, []);


  async function load() {
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/personal/abc",
          {
            cache:
              "no-store",
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Mijn ABC kon niet worden geladen.",
        );
      }

      setData({
        ...initialData,
        ...body,
      });

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Mijn ABC kon niet worden geladen.",
      );

    } finally {
      setLoading(false);
    }
  }


  function updateMoney(
    field:
      | "monthlyIncomeCents"
      | "monthlyExpensesCents"
      | "currentBufferCents"
      | "unforeseenBufferTargetCents"
      | "bridgeBufferTargetCents"
      | "currentCreationCents"
      | "creationTargetCents",

    value: string,
  ) {
    const cents =
      toCents(
        value,
      );

    if (cents === null) {
      return;
    }

    setData(
      current => ({
        ...current,
        [field]:
          cents,
      }),
    );
  }


  async function save() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/personal/abc",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify(
                data,
              ),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
          "Opslaan is niet gelukt.",
        );
      }

      setData({
        ...initialData,
        ...body,
      });

      setMessage(
        "Mijn ABC is opgeslagen.",
      );

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Opslaan is niet gelukt.",
      );

    } finally {
      setSaving(false);
    }
  }


  if (loading) {
    return (
      <section className="personal-module-empty">
        Mijn ABC wordt geladen…
      </section>
    );
  }


  return (
    <div className="personal-abc-page">

      <header className="personal-abc-heading">

        <div>
          <span className="personal-area-label">
            MIJN BESTEMMING
          </span>

          <h1>
            Mijn ABC
          </h1>

          <p>
            Van financiële rust naar ruimte
            om jouw bestemming te realiseren.
          </p>
        </div>


        <button
          type="button"
          className="personal-abc-save"
          disabled={saving}
          onClick={save}
        >
          <Save />

          {saving
            ? "Opslaan…"
            : "ABC opslaan"}
        </button>

      </header>


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


      <section className="personal-abc-summary">

        <article>
          <span>
            Maandelijks over
          </span>

          <strong
            className={
              balance < 0
                ? "is-negative"
                : ""
            }
          >
            {euro(
              balance,
            )}
          </strong>

          <small>
            Inkomsten minus uitgaven
          </small>
        </article>


        <article>
          <span>
            Buffer
          </span>

          <strong>
            {bufferProgress}%
          </strong>

          <small>
            van jouw ingestelde bufferdoel
          </small>
        </article>


        <article>
          <span>
            Creatie
          </span>

          <strong>
            {creationProgress}%
          </strong>

          <small>
            van jouw persoonlijke doel
          </small>
        </article>

      </section>


      <section className="personal-abc-grid">

        <article className="personal-abc-card">

          <div className="personal-abc-card-head">

            <div className="personal-abc-letter">
              A
            </div>

            <div>
              <span>
                Evenwicht
              </span>

              <h2>
                Wat komt erin en wat gaat eruit?
              </h2>
            </div>

          </div>


          <div className="personal-abc-fields">

            <label className="field">
              <span>
                Maandelijkse inkomsten
              </span>

              <div className="personal-money-input">
                <span>€</span>

                <input
                  inputMode="decimal"
                  defaultValue={
                    inputValue(
                      data.monthlyIncomeCents,
                    )
                  }
                  onBlur={event =>
                    updateMoney(
                      "monthlyIncomeCents",
                      event.target.value,
                    )
                  }
                />
              </div>
            </label>


            <label className="field">
              <span>
                Maandelijkse uitgaven
              </span>

              <div className="personal-money-input">
                <span>€</span>

                <input
                  inputMode="decimal"
                  defaultValue={
                    inputValue(
                      data.monthlyExpensesCents,
                    )
                  }
                  onBlur={event =>
                    updateMoney(
                      "monthlyExpensesCents",
                      event.target.value,
                    )
                  }
                />
              </div>
            </label>

          </div>


          <div className="personal-abc-result">

            <WalletCards />

            <div>
              <span>
                Maandelijks verschil
              </span>

              <strong>
                {euro(
                  balance,
                )}
              </strong>
            </div>

          </div>

        </article>


        <article className="personal-abc-card">

          <div className="personal-abc-card-head">

            <div className="personal-abc-letter">
              B
            </div>

            <div>
              <span>
                Buffer
              </span>

              <h2>
                Ruimte voor wat je niet kunt plannen
              </h2>
            </div>

          </div>


          <div className="personal-abc-fields">

            <label className="field">
              <span>
                Huidige buffer
              </span>

              <div className="personal-money-input">
                <span>€</span>

                <input
                  inputMode="decimal"
                  defaultValue={
                    inputValue(
                      data.currentBufferCents,
                    )
                  }
                  onBlur={event =>
                    updateMoney(
                      "currentBufferCents",
                      event.target.value,
                    )
                  }
                />
              </div>
            </label>


            <label className="field">
              <span>
                Buffer onvoorzien
              </span>

              <div className="personal-money-input">
                <span>€</span>

                <input
                  inputMode="decimal"
                  defaultValue={
                    inputValue(
                      data.unforeseenBufferTargetCents,
                    )
                  }
                  onBlur={event =>
                    updateMoney(
                      "unforeseenBufferTargetCents",
                      event.target.value,
                    )
                  }
                />
              </div>
            </label>


            <label className="field">
              <span>
                Overbruggingsbuffer
              </span>

              <div className="personal-money-input">
                <span>€</span>

                <input
                  inputMode="decimal"
                  defaultValue={
                    inputValue(
                      data.bridgeBufferTargetCents,
                    )
                  }
                  onBlur={event =>
                    updateMoney(
                      "bridgeBufferTargetCents",
                      event.target.value,
                    )
                  }
                />
              </div>
            </label>

          </div>


          <div className="personal-progress">

            <div>
              <span>
                {euro(
                  data.currentBufferCents,
                )}
              </span>

              <span>
                {euro(
                  totalBufferTarget,
                )}
              </span>
            </div>

            <progress
              max={100}
              value={bufferProgress}
            />

            <small>
              {bufferProgress}% van jouw totale bufferdoel
            </small>

          </div>

        </article>


        <article className="personal-abc-card">

          <div className="personal-abc-card-head">

            <div className="personal-abc-letter">
              C
            </div>

            <div>
              <span>
                Creatie
              </span>

              <h2>
                Waarde opbouwen richting jouw bestemming
              </h2>
            </div>

          </div>


          <div className="personal-abc-fields">

            <label className="field">
              <span>
                Huidige opgebouwde waarde
              </span>

              <div className="personal-money-input">
                <span>€</span>

                <input
                  inputMode="decimal"
                  defaultValue={
                    inputValue(
                      data.currentCreationCents,
                    )
                  }
                  onBlur={event =>
                    updateMoney(
                      "currentCreationCents",
                      event.target.value,
                    )
                  }
                />
              </div>
            </label>


            <label className="field">
              <span>
                Persoonlijk doel
              </span>

              <div className="personal-money-input">
                <span>€</span>

                <input
                  inputMode="decimal"
                  defaultValue={
                    inputValue(
                      data.creationTargetCents,
                    )
                  }
                  onBlur={event =>
                    updateMoney(
                      "creationTargetCents",
                      event.target.value,
                    )
                  }
                />
              </div>
            </label>


            <label className="field">
              <span>
                Gewenste doeldatum
              </span>

              <input
                type="date"
                value={
                  data.creationGoalDate ??
                  ""
                }
                onChange={event =>
                  setData(
                    current => ({
                      ...current,

                      creationGoalDate:
                        event.target.value ||
                        null,
                    }),
                  )
                }
              />
            </label>

          </div>


          <div className="personal-progress">

            <div>
              <span>
                {euro(
                  data.currentCreationCents,
                )}
              </span>

              <span>
                {euro(
                  data.creationTargetCents,
                )}
              </span>
            </div>

            <progress
              max={100}
              value={creationProgress}
            />

            <small>
              {creationProgress}% van jouw doel bereikt
            </small>

          </div>

        </article>

      </section>


      <section className="personal-abc-flow">

        <div>
          <CircleDollarSign />
          <strong>A</strong>
          <span>Evenwicht</span>
        </div>

        <ArrowRight />

        <div>
          <Landmark />
          <strong>B</strong>
          <span>Buffer</span>
        </div>

        <ArrowRight />

        <div>
          <Sparkles />
          <strong>C</strong>
          <span>Creatie</span>
        </div>

      </section>


      <section className="personal-abc-notes">

        <PiggyBank />

        <label className="field">

          <span>
            Notities bij jouw ABC
          </span>

          <textarea
            value={
              data.notes ??
              ""
            }
            onChange={event =>
              setData(
                current => ({
                  ...current,

                  notes:
                    event.target.value,
                }),
              )
            }
            placeholder="Bijvoorbeeld plannen, aandachtspunten of afspraken."
          />

        </label>

      </section>

    </div>
  );
}
