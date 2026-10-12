"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  CalendarDays,
  Plus,
  Save,
  Target,
  Trash2,
} from "lucide-react";


type Plan = {
  destination: string | null;
  currentSituation: string | null;
  desiredSituation: string | null;
  importantValues: string | null;
  opportunities: string | null;
  concerns: string | null;
  annualReviewDate: string | null;
  nextReviewDate: string | null;
  updatedAt: string | null;
};


type Goal = {
  id: string;
  title: string;
  category: string;
  targetDate: string | null;
  status: string;
  notes: string | null;
  position: number;
};


const emptyPlan: Plan = {
  destination: null,
  currentSituation: null,
  desiredSituation: null,
  importantValues: null,
  opportunities: null,
  concerns: null,
  annualReviewDate: null,
  nextReviewDate: null,
  updatedAt: null,
};


export default function PersonalLifePlan() {
  const [plan, setPlan] =
    useState<Plan>(
      emptyPlan,
    );

  const [goals, setGoals] =
    useState<Goal[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [goalTitle, setGoalTitle] =
    useState("");

  const [goalCategory, setGoalCategory] =
    useState("personal");

  const [goalDate, setGoalDate] =
    useState("");

  const [goalNotes, setGoalNotes] =
    useState("");


  async function load() {
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/personal/life-plan",
          {
            cache: "no-store",
          },
        );

      const data =
        await response.json() as {
          error?: string;
          plan?: Plan;
          goals?: Goal[];
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Laden is niet gelukt.",
        );
      }

      setPlan(
        data.plan ||
        emptyPlan,
      );

      setGoals(
        Array.isArray(data.goals)
          ? data.goals
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


  async function savePlan() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/personal/life-plan",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "save-plan",

                plan,
              }),
          },
        );

      const data =
        await response.json() as {
          error?: string;
          plan?: Plan;
          goals?: Goal[];
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Opslaan is niet gelukt.",
        );
      }

      setPlan(
        data.plan ||
        plan,
      );

      setMessage(
        "Jouw levensplan is opgeslagen.",
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


  async function addGoal() {
    if (!goalTitle.trim()) {
      setError(
        "Geef het doel een naam.",
      );

      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          "/api/personal/life-plan",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "save-goal",

                goal: {
                  title:
                    goalTitle.trim(),

                  category:
                    goalCategory,

                  targetDate:
                    goalDate || null,

                  status:
                    "active",

                  notes:
                    goalNotes || null,

                  position:
                    goals.length,
                },
              }),
          },
        );

      const data =
        await response.json() as {
          error?: string;
          plan?: Plan;
          goals?: Goal[];
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Doel toevoegen is niet gelukt.",
        );
      }

      setGoalTitle("");
      setGoalDate("");
      setGoalNotes("");

      await load();

      setMessage(
        "Doel toegevoegd.",
      );

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Doel toevoegen is niet gelukt.",
      );

    } finally {
      setBusy(false);
    }
  }


  async function deleteGoal(
    goalId: string,
  ) {
    if (
      !window.confirm(
        "Wil je dit doel verwijderen?",
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/personal/life-plan",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "delete-goal",

                goalId,
              }),
          },
        );

      const data =
        await response.json() as {
          error?: string;
          plan?: Plan;
          goals?: Goal[];
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Verwijderen is niet gelukt.",
        );
      }

      setGoals(
        current =>
          current.filter(
            goal =>
              goal.id !== goalId,
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
        Uw levensplan wordt geladen…
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
          Mijn levensplan
        </h1>

        <p>
          Waar staat u nu, waar wilt u
          naartoe en welke stappen horen
          bij uw bestemming?
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
            <Target />

            <div>
              <span className="personal-area-label">
                RICHTING
              </span>

              <h2>
                Mijn bestemming
              </h2>
            </div>
          </div>


          <label className="field">
            <span>
              Wat is uw bestemming?
            </span>

            <textarea
              value={
                plan.destination ?? ""
              }
              onChange={event =>
                setPlan(
                  current => ({
                    ...current,
                    destination:
                      event.target.value,
                  }),
                )
              }
            />
          </label>


          <label className="field">
            <span>
              Waar staat u nu?
            </span>

            <textarea
              value={
                plan.currentSituation ??
                ""
              }
              onChange={event =>
                setPlan(
                  current => ({
                    ...current,
                    currentSituation:
                      event.target.value,
                  }),
                )
              }
            />
          </label>


          <label className="field">
            <span>
              Waar wilt u naartoe?
            </span>

            <textarea
              value={
                plan.desiredSituation ??
                ""
              }
              onChange={event =>
                setPlan(
                  current => ({
                    ...current,
                    desiredSituation:
                      event.target.value,
                  }),
                )
              }
            />
          </label>


          <label className="field">
            <span>
              Wat vindt u belangrijk?
            </span>

            <textarea
              value={
                plan.importantValues ??
                ""
              }
              onChange={event =>
                setPlan(
                  current => ({
                    ...current,
                    importantValues:
                      event.target.value,
                  }),
                )
              }
            />
          </label>


          <div className="personal-two-column">

            <label className="field">
              <span>
                Kansen
              </span>

              <textarea
                value={
                  plan.opportunities ??
                  ""
                }
                onChange={event =>
                  setPlan(
                    current => ({
                      ...current,
                      opportunities:
                        event.target.value,
                    }),
                  )
                }
              />
            </label>


            <label className="field">
              <span>
                Aandachtspunten
              </span>

              <textarea
                value={
                  plan.concerns ??
                  ""
                }
                onChange={event =>
                  setPlan(
                    current => ({
                      ...current,
                      concerns:
                        event.target.value,
                    }),
                  )
                }
              />
            </label>

          </div>


          <div className="personal-two-column">

            <label className="field">
              <span>
                Laatste jaarlijkse update
              </span>

              <input
                type="date"
                value={
                  plan.annualReviewDate ??
                  ""
                }
                onChange={event =>
                  setPlan(
                    current => ({
                      ...current,
                      annualReviewDate:
                        event.target.value ||
                        null,
                    }),
                  )
                }
              />
            </label>


            <label className="field">
              <span>
                Volgende jaarlijkse update
              </span>

              <input
                type="date"
                value={
                  plan.nextReviewDate ??
                  ""
                }
                onChange={event =>
                  setPlan(
                    current => ({
                      ...current,
                      nextReviewDate:
                        event.target.value ||
                        null,
                    }),
                  )
                }
              />
            </label>

          </div>


          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={savePlan}
          >
            <Save />

            {busy
              ? "Opslaan…"
              : "Levensplan opslaan"}
          </button>

        </article>


        <article className="card personal-goals-card">

          <div className="personal-card-title">
            <Target />

            <div>
              <span className="personal-area-label">
                DOELEN
              </span>

              <h2>
                Mijn doelen
              </h2>
            </div>
          </div>


          <div className="personal-goal-list">

            {goals.length === 0 && (
              <p className="muted">
                Nog geen persoonlijke doelen.
              </p>
            )}


            {goals.map(goal => (
              <div
                key={goal.id}
                className="personal-goal-row"
              >

                <div>
                  <strong>
                    {goal.title}
                  </strong>

                  <span>
                    {goal.targetDate
                      ? new Date(
                          `${goal.targetDate}T00:00:00`,
                        ).toLocaleDateString(
                          "nl-NL",
                        )
                      : "Geen doeldatum"}
                  </span>
                </div>


                <button
                  type="button"
                  className="personal-delete-button"
                  aria-label="Doel verwijderen"
                  onClick={() =>
                    deleteGoal(
                      goal.id,
                    )
                  }
                >
                  <Trash2 />
                </button>

              </div>
            ))}

          </div>


          <div className="personal-add-goal">

            <h3>
              Nieuw doel
            </h3>


            <label className="field">
              <span>
                Doel
              </span>

              <input
                value={goalTitle}
                onChange={event =>
                  setGoalTitle(
                    event.target.value,
                  )
                }
              />
            </label>


            <div className="personal-two-column">

              <label className="field">
                <span>
                  Categorie
                </span>

                <select
                  value={goalCategory}
                  onChange={event =>
                    setGoalCategory(
                      event.target.value,
                    )
                  }
                >
                  <option value="personal">
                    Persoonlijk
                  </option>

                  <option value="financial">
                    Financieel
                  </option>

                  <option value="work">
                    Werk
                  </option>

                  <option value="family">
                    Gezin
                  </option>

                  <option value="living">
                    Wonen
                  </option>

                  <option value="health">
                    Gezondheid
                  </option>

                  <option value="travel">
                    Reizen
                  </option>

                  <option value="retirement">
                    Pensioen
                  </option>

                  <option value="other">
                    Overig
                  </option>
                </select>
              </label>


              <label className="field">
                <span>
                  Doeldatum
                </span>

                <input
                  type="date"
                  value={goalDate}
                  onChange={event =>
                    setGoalDate(
                      event.target.value,
                    )
                  }
                />
              </label>

            </div>


            <label className="field">
              <span>
                Notitie
              </span>

              <textarea
                value={goalNotes}
                onChange={event =>
                  setGoalNotes(
                    event.target.value,
                  )
                }
              />
            </label>


            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={addGoal}
            >
              <Plus />
              Doel toevoegen
            </button>

          </div>


          <div className="personal-review-note">
            <CalendarDays />

            <p>
              Het levensplan is bedoeld als
              levend document en kan tijdens
              de periodieke gesprekken worden
              bijgewerkt.
            </p>
          </div>

        </article>

      </section>

    </div>
  );
}
