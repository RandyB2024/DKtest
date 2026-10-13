"use client";

import {
  ArrowRight,
  Bot,
  Building2,
  CircleAlert,
  Compass,
  MessageCircleMore,
  Send,
  Sparkles,
} from "lucide-react";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";


type WizeMessage = {
  id: string;
  role:
    | "customer"
    | "wize";

  body: string;

  needsHuman?:
    boolean;

  action?:
    string | null;
};


type WizeSummary = {
  organization: {
    id: string;
    name: string;
  };

  receivables: {
    totalCents: number;
    overdueCents: number;
    count: number;
  };

  payables: {
    totalCents: number;
    overdueCents: number;
    count: number;
  };

  month: {
    revenueCents: number;
    costsCents: number;
    resultCents: number;
  };

  bank: {
    transactionCount: number;
    unmatchedCount: number;
    suggestedCount: number;
    matchedCount: number;
  };
};


const suggestions = [
  "Hoe staat mijn onderneming ervoor?",
  "Welke facturen staan nog open?",
  "Wat is mijn omzet deze maand?",
  "Mis ik nog bonnen of documenten?",
];


export default function WizeView({
  context,
  organization,
  onGo,
}: {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo?: (
    view: string,
  ) => void;
}) {
  const [
    summary,
    setSummary,
  ] =
    useState<
      WizeSummary | null
    >(null);

  const [
    messages,
    setMessages,
  ] =
    useState<
      WizeMessage[]
    >([]);

  const [
    input,
    setInput,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    summaryLoading,
    setSummaryLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const bottomRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  const firstName =
    useMemo(
      () =>
        context
          .profile
          .display_name
          .trim()
          .split(
            /\s+/,
          )[0] ||
        "",
      [
        context
          .profile
          .display_name,
      ],
    );


  useEffect(
    () => {
      if (
        context
          .organizationId ===
        "all"
      ) {
        setSummary(
          null,
        );

        return;
      }

      let cancelled =
        false;

      async function load() {
        setSummaryLoading(
          true,
        );

        setError("");

        try {
          const response =
            await fetch(
              `/api/wize?organizationId=${encodeURIComponent(
                context
                  .organizationId,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            await response.json() as
              WizeSummary & {
                error?:
                  string;
              };

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ||
                "Wize kon de administratie niet lezen.",
            );
          }

          if (
            !cancelled
          ) {
            setSummary(
              data,
            );
          }
        } catch (
          caughtError
        ) {
          if (
            !cancelled
          ) {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : "Wize kon de administratie niet lezen.",
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setSummaryLoading(
              false,
            );
          }
        }
      }

      void load();

      return () => {
        cancelled =
          true;
      };
    },
    [
      context
        .organizationId,
    ],
  );


  useEffect(
    () => {
      bottomRef
        .current
        ?.scrollIntoView(
          {
            block:
              "nearest",
          },
        );
    },
    [
      messages,
      loading,
    ],
  );


  async function ask(
    question: string,
  ) {
    const clean =
      question.trim();

    if (
      !clean ||
      loading
    ) {
      return;
    }

    if (
      context
        .organizationId ===
      "all"
    ) {
      setError(
        "Selecteer eerst één onderneming zodat Wize de juiste administratie gebruikt.",
      );

      return;
    }

    const customerMessage:
      WizeMessage =
      {
        id:
          crypto
            .randomUUID(),

        role:
          "customer",

        body:
          clean,
      };

    setMessages(
      (current) => [
        ...current,
        customerMessage,
      ],
    );

    setInput("");
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/wize",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  action:
                    "ask",

                  organizationId:
                    context
                      .organizationId,

                  message:
                    clean,
                },
              ),
          },
        );

      const data =
        await response.json() as {
          answer?: string;
          needsHuman?:
            boolean;
          action?:
            string | null;
          error?:
            string;
        };

      if (
        !response.ok ||
        !data.answer
      ) {
        throw new Error(
          data.error ||
            "Wize kon deze vraag niet beantwoorden.",
        );
      }

      const answer =
        data.answer;

      setMessages(
        (current) => [
          ...current,
          {
            id:
              crypto
                .randomUUID(),

            role:
              "wize",

            body:
              answer,

            needsHuman:
              Boolean(
                data
                  .needsHuman,
              ),

            action:
              data.action ??
              null,
          },
        ],
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Wize kon deze vraag niet beantwoorden.",
      );
    } finally {
      setLoading(false);
    }
  }


  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    await ask(
      input,
    );
  }


  async function escalate(
    message:
      WizeMessage,
  ) {
    const index =
      messages.findIndex(
        (item) =>
          item.id ===
          message.id,
      );

    const previousCustomer =
      [...messages]
        .slice(
          0,
          index,
        )
        .reverse()
        .find(
          (item) =>
            item.role ===
            "customer",
        );

    if (
      !previousCustomer
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/wize",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  action:
                    "escalate",

                  organizationId:
                    context
                      .organizationId,

                  question:
                    previousCustomer
                      .body,

                  wizeAnswer:
                    message.body,
                },
              ),
          },
        );

      const data =
        await response.json() as {
          conversationId?:
            string | null;
          error?:
            string;
        };

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ||
            "De vraag kon niet worden doorgestuurd.",
        );
      }

      if (
        data
          .conversationId
      ) {
        const url =
          new URL(
            window
              .location
              .href,
          );

        url.searchParams.set(
          "view",
          "communication",
        );

        url.searchParams.set(
          "thread",
          data
            .conversationId,
        );

        window.history
          .replaceState(
            {},
            "",
            url,
          );
      }

      onGo?.(
        "Communicatie",
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "De vraag kon niet worden doorgestuurd.",
      );
    } finally {
      setLoading(false);
    }
  }


  if (
    context
      .organizationId ===
    "all"
  ) {
    return (
      <section className="wize-select-company">
        <Compass />

        <h1>Wize</h1>

        <p>
          Slim inzicht.
          Duidelijke richting.
        </p>

        <strong>
          Selecteer eerst één
          onderneming.
        </strong>

        <span>
          Wize werkt altijd binnen
          één onderneming tegelijk.
        </span>
      </section>
    );
  }


  return (
    <div className="wize-page">
      <header className="wize-header">
        <div className="wize-brand">
          <span className="wize-logo">
            <Compass />
          </span>

          <div>
            <span className="wize-kicker">
              BESTEMD ASSISTENT
            </span>

            <h1>
              Wize
            </h1>

            <p>
              Slim inzicht.
              Duidelijke richting.
            </p>
          </div>
        </div>

        <div className="wize-company">
          <Building2 />

          <span>
            <small>
              Actieve onderneming
            </small>

            <strong>
              {organization
                ?.name ??
                summary
                  ?.organization
                  .name ??
                "Onderneming"}
            </strong>
          </span>
        </div>
      </header>


      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}


      <div className="wize-layout">
        <main className="wize-chat-card">
          <div className="wize-chat-scroll">
            <div className="wize-message wize-message-assistant">
              <span className="wize-avatar">
                <Sparkles />
              </span>

              <div>
                <strong>
                  Wize
                </strong>

                <p>
                  Hoi{firstName
                    ? ` ${firstName}`
                    : ""}.
                  Ik kijk met je mee
                  binnen{" "}
                  <b>
                    {organization
                      ?.name ??
                      "jouw onderneming"}
                  </b>
                  . Vraag me bijvoorbeeld
                  naar je omzet,
                  openstaande facturen
                  of documenten die
                  aandacht nodig hebben.
                </p>
              </div>
            </div>


            {summary &&
              summary.bank
                .unmatchedCount >
                0 && (
              <div className="wize-signal">
                <span>
                  <CircleAlert />
                </span>

                <div>
                  <strong>
                    Wize ziet iets dat
                    aandacht nodig heeft
                  </strong>

                  <p>
                    Er zijn{" "}
                    {
                      summary
                        .bank
                        .unmatchedCount
                    }{" "}
                    bankmutatie
                    {summary
                      .bank
                      .unmatchedCount ===
                    1
                      ? ""
                      : "s"}{" "}
                    die nog niet volledig
                    zijn gekoppeld. Mogelijk
                    ontbreekt er nog een
                    factuur of bon.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      onGo?.(
                        "Bankieren",
                      )
                    }
                  >
                    Bekijken
                    <ArrowRight />
                  </button>
                </div>
              </div>
            )}


            {messages.map(
              (message) => (
                <div
                  key={
                    message.id
                  }
                  className={
                    message.role ===
                    "customer"
                      ? "wize-message wize-message-customer"
                      : "wize-message wize-message-assistant"
                  }
                >
                  {message.role ===
                    "wize" && (
                    <span className="wize-avatar">
                      <Sparkles />
                    </span>
                  )}

                  <div>
                    <strong>
                      {message.role ===
                      "customer"
                        ? "Jij"
                        : "Wize"}
                    </strong>

                    <p>
                      {
                        message.body
                      }
                    </p>

                    {message.action && (
                      <button
                        type="button"
                        className="wize-inline-action"
                        onClick={() =>
                          onGo?.(
                            message
                              .action!,
                          )
                        }
                      >
                        Open{" "}
                        {
                          message
                            .action
                        }

                        <ArrowRight />
                      </button>
                    )}

                    {message
                      .needsHuman && (
                      <button
                        type="button"
                        className="wize-human-button"
                        disabled={
                          loading
                        }
                        onClick={() =>
                          void escalate(
                            message,
                          )
                        }
                      >
                        <MessageCircleMore />

                        Vraag Bestemd
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}


            {loading && (
              <div className="wize-message wize-message-assistant">
                <span className="wize-avatar">
                  <Bot />
                </span>

                <div>
                  <strong>
                    Wize
                  </strong>

                  <p className="wize-thinking">
                    Ik kijk het voor je na...
                  </p>
                </div>
              </div>
            )}

            <div
              ref={
                bottomRef
              }
            />
          </div>


          {messages.length ===
            0 && (
            <div className="wize-suggestions">
              {suggestions.map(
                (suggestion) => (
                  <button
                    key={
                      suggestion
                    }
                    type="button"
                    disabled={
                      loading
                    }
                    onClick={() =>
                      void ask(
                        suggestion,
                      )
                    }
                  >
                    {
                      suggestion
                    }
                  </button>
                ),
              )}
            </div>
          )}


          <form
            className="wize-composer"
            onSubmit={
              submit
            }
          >
            <input
              type="text"
              value={
                input
              }
              maxLength={
                3000
              }
              disabled={
                loading
              }
              onChange={(
                event,
              ) =>
                setInput(
                  event
                    .target
                    .value,
                )
              }
              placeholder="Vraag Wize iets over jouw onderneming..."
            />

            <button
              type="submit"
              disabled={
                loading ||
                !input.trim()
              }
              aria-label="Vraag versturen"
            >
              <Send />
            </button>
          </form>

          <small className="wize-disclaimer">
            Wize gebruikt alleen gegevens
            van de geselecteerde onderneming.
            Bij twijfel schakelt Wize Bestemd
            in.
          </small>
        </main>


        <aside className="wize-side">
          <section>
            <span className="wize-side-label">
              WIZE ZIET
            </span>

            <h2>
              Jouw onderneming
            </h2>

            {summaryLoading ? (
              <p>
                Gegevens laden...
              </p>
            ) : summary ? (
              <div className="wize-facts">
                <div>
                  <span>
                    Open bij klanten
                  </span>

                  <strong>
                    {
                      summary
                        .receivables
                        .count
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Open bij leveranciers
                  </span>

                  <strong>
                    {
                      summary
                        .payables
                        .count
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Bankmutaties aandacht
                  </span>

                  <strong>
                    {
                      summary
                        .bank
                        .unmatchedCount
                    }
                  </strong>
                </div>
              </div>
            ) : (
              <p>
                Nog geen gegevens
                beschikbaar.
              </p>
            )}
          </section>

          <section className="wize-side-safe">
            <Compass />

            <strong>
              Veilig binnen jouw
              onderneming
            </strong>

            <p>
              Wize ontvangt nooit zelf
              een vrij te kiezen
              onderneming-ID. De server
              controleert jouw toegang
              voordat gegevens worden
              gelezen.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
