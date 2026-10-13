"use client";

import {
  ArrowRight,
  Building2,
  FileUp,
  MessageCircleMore,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import {
  FormEvent,
  useEffect,
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

  actionLabel?:
    string | null;
};


type ProactiveSignal = {
  id: string;

  type:
    | "missing_document"
    | "attention";

  message: string;

  action:
    string | null;

  actionLabel:
    string | null;
};


type WizeSummary = {
  organization: {
    id: string;
    name: string;
  };

  proactiveSignals?:
    ProactiveSignal[];

  bank: {
    unmatchedCount: number;
  };
};


const suggestions = [
  "Hoe staat mijn onderneming ervoor?",
  "Welke facturen staan nog open?",
  "Wat is mijn omzet deze maand?",
  "Mis ik nog bonnen?",
];


export default function WizeChatPanel({
  open,
  onClose,
  context,
  organization,
  onGo,
}: {
  open: boolean;

  onClose: () => void;

  context: PortalContext;

  organization?: PortalOrganization;

  onGo?: (
    view: string,
  ) => void;
}) {
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
    contextLoading,
    setContextLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    loadedOrganizationId,
    setLoadedOrganizationId,
  ] =
    useState<
      string | null
    >(null);

  const bottomRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  const firstName =
    context
      .profile
      .display_name
      .trim()
      .split(/\s+/)[0] ||
    "";


  useEffect(
    () => {
      if (
        !open ||
        context
          .organizationId ===
        "all"
      ) {
        return;
      }

      if (
        loadedOrganizationId ===
        context.organizationId
      ) {
        return;
      }

      let cancelled =
        false;

      async function loadWizeContext() {
        setContextLoading(
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
                "Ik kan de administratie nu even niet goed bekijken.",
            );
          }

          if (
            cancelled
          ) {
            return;
          }

          const welcome:
            WizeMessage =
            {
              id:
                `welcome-${context.organizationId}`,

              role:
                "wize",

              body:
                `Hoi${
                  firstName
                    ? ` ${firstName}`
                    : ""
                } 👋 Ik kijk met je mee binnen ${
                  organization
                    ?.name ??
                  data
                    .organization
                    .name
                }. Vraag gerust wat er speelt. Als ik iets zie dat aandacht nodig heeft, geef ik je vanzelf een seintje.`,
            };

          const proactive =
            (
              data
                .proactiveSignals ??
              []
            )
              .slice(
                0,
                3,
              )
              .map(
                (
                  signal,
                ): WizeMessage => ({
                  id:
                    signal.id,

                  role:
                    "wize",

                  body:
                    signal.message,

                  action:
                    signal.action,

                  actionLabel:
                    signal
                      .actionLabel,
                }),
              );

          setMessages(
            [
              welcome,
              ...proactive,
            ],
          );

          setLoadedOrganizationId(
            context
              .organizationId,
          );
        } catch (
          caughtError
        ) {
          if (
            !cancelled
          ) {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : "Ik kan de administratie nu even niet goed bekijken.",
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setContextLoading(
              false,
            );
          }
        }
      }

      void loadWizeContext();

      return () => {
        cancelled =
          true;
      };
    },
    [
      open,
      context
        .organizationId,
      loadedOrganizationId,
      organization
        ?.name,
      firstName,
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
      open,
    ],
  );


  useEffect(
    () => {
      setLoadedOrganizationId(
        null,
      );

      setMessages(
        [],
      );
    },
    [
      context
        .organizationId,
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
        "Kies eerst één onderneming. Dan weet ik zeker dat ik alleen de juiste administratie gebruik.",
      );

      return;
    }

    setMessages(
      (current) => [
        ...current,
        {
          id:
            crypto
              .randomUUID(),

          role:
            "customer",

          body:
            clean,
        },
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
          answer?:
            string;

          needsHuman?:
            boolean;

          action?:
            string | null;

          actionLabel?:
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
            "Daar kom ik nu even niet goed uit.",
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

            actionLabel:
              data
                .actionLabel ??
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
          : "Daar kom ik nu even niet goed uit.",
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
      messages
        .findIndex(
          (item) =>
            item.id ===
            message.id,
        );

    const customerMessage =
      [
        ...messages,
      ]
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
      !customerMessage
    ) {
      setError(
        "Ik heb nog geen vraag om door te zetten.",
      );

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
                    customerMessage
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
            "Ik kon Bestemd er niet bij halen.",
        );
      }

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
              "Gelukt 👍 Ik heb je vraag bij Bestemd neergelegd. Randy of Ed kan het gesprek vanaf hier overnemen.",
          },
        ],
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ik kon Bestemd er niet bij halen.",
      );
    } finally {
      setLoading(false);
    }
  }


  function go(
    view: string,
  ) {
    onGo?.(
      view,
    );

    onClose();
  }


  if (
    !open
  ) {
    return null;
  }


  return (
    <>
      <div
        className="wize-chat-backdrop"
        onClick={
          onClose
        }
      />

      <section
        className="wize-chat-panel"
        aria-label="Wize"
      >
        <header className="wize-chat-header">
          <div className="wize-chat-brand">
            <span className="wize-chat-logo">
              <Sparkles />
            </span>

            <div>
              <strong>
                Wize
              </strong>

              <small>
                Slim inzicht.
                Duidelijke richting.
              </small>
            </div>
          </div>

          <button
            type="button"
            className="wize-chat-close"
            onClick={
              onClose
            }
            aria-label="Wize sluiten"
          >
            <X />
          </button>
        </header>


        <div className="wize-chat-company">
          <Building2 />

          <span>
            {organization
              ?.name ??
              (
                context
                  .organizationId ===
                "all"
                  ? "Kies een onderneming"
                  : "Jouw onderneming"
              )}
          </span>
        </div>


        <div className="wize-chat-messages">
          {context
            .organizationId ===
          "all" ? (
            <div className="wize-chat-system">
              <strong>
                Eerst even kiezen 🙂
              </strong>

              <p>
                Selecteer bovenaan één
                onderneming. Daarna kijk ik
                alleen binnen die administratie
                met je mee.
              </p>
            </div>
          ) : contextLoading ? (
            <div className="wize-chat-system">
              Even kijken wat er speelt...
            </div>
          ) : (
            <>
              {messages.map(
                (message) => (
                  <div
                    key={
                      message.id
                    }
                    className={
                      message.role ===
                      "customer"
                        ? "wize-chat-message customer"
                        : "wize-chat-message assistant"
                    }
                  >
                    {message.role ===
                      "wize" && (
                      <span className="wize-chat-avatar">
                        <Sparkles />
                      </span>
                    )}

                    <div className="wize-chat-bubble">
                      <small>
                        {message.role ===
                        "customer"
                          ? "Jij"
                          : "Wize"}
                      </small>

                      <p>
                        {
                          message.body
                        }
                      </p>

                      {message.action && (
                        <button
                          type="button"
                          className="wize-chat-action"
                          onClick={() =>
                            go(
                              message
                                .action!,
                            )
                          }
                        >
                          {message
                            .actionLabel ??
                            `Open ${message.action}`}

                          {message
                            .action ===
                          "Documenten" ? (
                            <FileUp />
                          ) : (
                            <ArrowRight />
                          )}
                        </button>
                      )}

                      {message
                        .needsHuman && (
                        <button
                          type="button"
                          className="wize-chat-human"
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
                <div className="wize-chat-message assistant">
                  <span className="wize-chat-avatar">
                    <Sparkles />
                  </span>

                  <div className="wize-chat-bubble">
                    <small>
                      Wize
                    </small>

                    <p className="wize-chat-thinking">
                      Momentje, ik kijk even mee...
                    </p>
                  </div>
                </div>
              )}

              <div
                ref={
                  bottomRef
                }
              />
            </>
          )}
        </div>


        {messages.length <=
          1 &&
          context
            .organizationId !==
            "all" && (
          <div className="wize-chat-suggestions">
            {suggestions.map(
              (suggestion) => (
                <button
                  type="button"
                  key={
                    suggestion
                  }
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


        {error && (
          <div
            className="wize-chat-error"
            role="alert"
          >
            {error}
          </div>
        )}


        <form
          className="wize-chat-composer"
          onSubmit={
            submit
          }
        >
          <input
            type="text"
            value={
              input
            }
            disabled={
              loading ||
              context
                .organizationId ===
                "all"
            }
            maxLength={
              3000
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
            placeholder="Vraag Wize iets..."
          />

          <button
            type="submit"
            disabled={
              loading ||
              !input.trim() ||
              context
                .organizationId ===
                "all"
            }
            aria-label="Versturen"
          >
            <Send />
          </button>
        </form>


        <div className="wize-chat-footer">
          Wize kijkt alleen mee binnen
          deze onderneming.
        </div>
      </section>
    </>
  );
}
