"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  CalendarDays,
  HeartHandshake,
  Plus,
  Trash2,
} from "lucide-react";


type Entry = {
  id: string;
  sessionDate: string;
  title: string;
  preparation: string | null;
  reflection: string | null;
  actionPoints: string | null;
  nextSessionDate: string | null;
  status: string;
};


export default function PersonalCoaching() {
  const [entries, setEntries] =
    useState<Entry[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [sessionDate, setSessionDate] =
    useState("");

  const [title, setTitle] =
    useState("");

  const [preparation, setPreparation] =
    useState("");

  const [reflection, setReflection] =
    useState("");

  const [actionPoints, setActionPoints] =
    useState("");

  const [nextSessionDate, setNextSessionDate] =
    useState("");

  const [status, setStatus] =
    useState("planned");


  async function load() {
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/personal/coaching",
          {
            cache: "no-store",
          },
        );

      const data =
        await response.json() as {
          error?: string;
          entries?: Entry[];
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Laden is niet gelukt.",
        );
      }

      setEntries(
        Array.isArray(data.entries)
          ? data.entries
          : [],
      );

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Laden is niet gelukt.",
      );

    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void load();
  }, []);


  async function saveEntry() {
    if (
      !sessionDate ||
      !title.trim()
    ) {
      setError(
        "Vul een datum en titel in.",
      );

      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/personal/coaching",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action: "save",

                entry: {
                  sessionDate,
                  title:
                    title.trim(),

                  preparation:
                    preparation ||
                    null,

                  reflection:
                    reflection ||
                    null,

                  actionPoints:
                    actionPoints ||
                    null,

                  nextSessionDate:
                    nextSessionDate ||
                    null,

                  status,
                },
              }),
          },
        );

      const data =
        await response.json() as {
          error?: string;
          entries?: Entry[];
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Opslaan is niet gelukt.",
        );
      }

      setSessionDate("");
      setTitle("");
      setPreparation("");
      setReflection("");
      setActionPoints("");
      setNextSessionDate("");
      setStatus("planned");

      await load();

      setMessage(
        "Coachingmoment opgeslagen.",
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


  async function deleteEntry(
    entryId: string,
  ) {
    if (
      !window.confirm(
        "Wil je dit coachingmoment verwijderen?",
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/personal/coaching",
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

                entryId,
              }),
          },
        );

      const data =
        await response.json() as {
          error?: string;
          entries?: Entry[];
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Verwijderen is niet gelukt.",
        );
      }

      setEntries(
        current =>
          current.filter(
            entry =>
              entry.id !== entryId,
          ),
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


  if (loading) {
    return (
      <section className="personal-module-empty">
        Lifecoaching wordt geladen…
      </section>
    );
  }


  return (
    <div className="personal-functional-page">

      <div className="personal-module-heading">

        <span className="personal-area-label">
          MIJN BESTEMMING
        </span>

        <h1>
          Lifecoaching
        </h1>

        <p>
          Bereid gesprekken voor, leg
          persoonlijke inzichten vast en
          houd uw volgende stappen bij.
        </p>

      </div>


      {error && (
        <p
          className="personal-form-error"
          role="alert"
        >
          {error}
        </p>
      )}


      {message && (
        <p
          className="personal-form-success"
          role="status"
        >
          {message}
        </p>
      )}


      <section className="personal-life-layout">

        <article className="card personal-life-form">

          <div className="personal-card-title">
            <HeartHandshake />

            <div>
              <span className="personal-area-label">
                GESPREK
              </span>

              <h2>
                Coachingmoment
              </h2>
            </div>
          </div>


          <div className="personal-two-column">

            <label className="field">
              <span>
                Datum
              </span>

              <input
                type="date"
                value={sessionDate}
                onChange={event =>
                  setSessionDate(
                    event.target.value,
                  )
                }
              />
            </label>


            <label className="field">
              <span>
                Status
              </span>

              <select
                value={status}
                onChange={event =>
                  setStatus(
                    event.target.value,
                  )
                }
              >
                <option value="planned">
                  Gepland
                </option>

                <option value="completed">
                  Afgerond
                </option>

                <option value="cancelled">
                  Geannuleerd
                </option>
              </select>
            </label>

          </div>


          <label className="field">
            <span>
              Onderwerp
            </span>

            <input
              value={title}
              onChange={event =>
                setTitle(
                  event.target.value,
                )
              }
              placeholder="Bijvoorbeeld: balans werk en privé"
            />
          </label>


          <label className="field">
            <span>
              Voorbereiding
            </span>

            <textarea
              value={preparation}
              onChange={event =>
                setPreparation(
                  event.target.value,
                )
              }
              placeholder="Wat wilt u tijdens dit gesprek bespreken?"
            />
          </label>


          <label className="field">
            <span>
              Mijn reflectie
            </span>

            <textarea
              value={reflection}
              onChange={event =>
                setReflection(
                  event.target.value,
                )
              }
              placeholder="Wat heeft het gesprek u gebracht?"
            />
          </label>


          <label className="field">
            <span>
              Actiepunten
            </span>

            <textarea
              value={actionPoints}
              onChange={event =>
                setActionPoints(
                  event.target.value,
                )
              }
            />
          </label>


          <label className="field">
            <span>
              Volgend gesprek
            </span>

            <input
              type="date"
              value={nextSessionDate}
              onChange={event =>
                setNextSessionDate(
                  event.target.value,
                )
              }
            />
          </label>


          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={saveEntry}
          >
            <Plus />

            {busy
              ? "Opslaan…"
              : "Coachingmoment opslaan"}
          </button>

        </article>


        <article className="card personal-goals-card">

          <div className="personal-card-title">
            <CalendarDays />

            <div>
              <span className="personal-area-label">
                HISTORIE
              </span>

              <h2>
                Mijn coaching
              </h2>
            </div>
          </div>


          <div className="personal-coaching-list">

            {entries.length === 0 && (
              <p className="muted">
                Nog geen coachingmomenten.
              </p>
            )}


            {entries.map(entry => (
              <div
                key={entry.id}
                className="personal-coaching-entry"
              >

                <div className="personal-coaching-entry-head">

                  <div>
                    <strong>
                      {entry.title}
                    </strong>

                    <span>
                      {new Date(
                        `${entry.sessionDate}T00:00:00`,
                      ).toLocaleDateString(
                        "nl-NL",
                      )}
                    </span>
                  </div>


                  <button
                    type="button"
                    className="personal-delete-button"
                    aria-label="Coachingmoment verwijderen"
                    onClick={() =>
                      deleteEntry(
                        entry.id,
                      )
                    }
                  >
                    <Trash2 />
                  </button>

                </div>


                {entry.preparation && (
                  <div>
                    <small>
                      Voorbereiding
                    </small>

                    <p>
                      {entry.preparation}
                    </p>
                  </div>
                )}


                {entry.reflection && (
                  <div>
                    <small>
                      Reflectie
                    </small>

                    <p>
                      {entry.reflection}
                    </p>
                  </div>
                )}


                {entry.actionPoints && (
                  <div>
                    <small>
                      Actiepunten
                    </small>

                    <p>
                      {entry.actionPoints}
                    </p>
                  </div>
                )}

              </div>
            ))}

          </div>

        </article>

      </section>

    </div>
  );
}
