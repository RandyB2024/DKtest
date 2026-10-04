"use client";

import {
  ArrowLeft,
  MessageCircleMore,
  Plus,
  Send,
} from "lucide-react";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  PortalContext,
} from "@/lib/portal-access";


type ConversationListItem = {
  id: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;

  latest_message: {
    body: string;
    created_at: string;
    sender_side:
      | "customer"
      | "office";
  } | null;
};


type ConversationDetail = {
  id: string;
  organization_id: string;
  organization_name: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};


type CommunicationMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_side:
    | "customer"
    | "office";
  body: string;
  created_at: string;
};


function formatDateTime(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(
    new Date(value),
  );
}


function preview(
  value: string,
) {
  const clean =
    value
      .replace(/\s+/g, " ")
      .trim();

  return clean.length > 110
    ? `${clean.slice(0, 107)}...`
    : clean;
}


export default function CommunicationView({
  context,
}: {
  context: PortalContext;
}) {
  const [
    conversations,
    setConversations,
  ] =
    useState<
      ConversationListItem[]
    >([]);

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    detail,
    setDetail,
  ] =
    useState<
      ConversationDetail | null
    >(null);

  const [
    messages,
    setMessages,
  ] =
    useState<
      CommunicationMessage[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    threadLoading,
    setThreadLoading,
  ] =
    useState(false);

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    newOpen,
    setNewOpen,
  ] =
    useState(false);

  const [
    subject,
    setSubject,
  ] =
    useState("");

  const [
    newBody,
    setNewBody,
  ] =
    useState("");

  const [
    reply,
    setReply,
  ] =
    useState("");

  const [
    newOrganizationId,
    setNewOrganizationId,
  ] =
    useState(
      context.organizationId ===
        "all"
        ? context.organizations[0]
            ?.id ?? ""
        : context.organizationId,
    );

  const bottomRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  const selectedOrganization =
    useMemo(
      () =>
        context.organizations.find(
          (item) =>
            item.id ===
            newOrganizationId,
        ) ?? null,
      [
        context.organizations,
        newOrganizationId,
      ],
    );


  const updateUrl =
    useCallback(
      (
        threadId:
          string | null,
      ) => {
        const url =
          new URL(
            window.location.href,
          );

        url.searchParams.set(
          "view",
          "communication",
        );

        if (threadId) {
          url.searchParams.set(
            "thread",
            threadId,
          );
        } else {
          url.searchParams.delete(
            "thread",
          );
        }

        window.history.replaceState(
          {},
          "",
          url,
        );
      },
      [],
    );


  const loadConversations =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const response =
            await fetch(
              `/api/communication?organizationId=${encodeURIComponent(
                context.organizationId,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            await response.json() as {
              conversations?:
                ConversationListItem[];
              error?: string;
            };

          if (!response.ok) {
            throw new Error(
              data.error ||
                "Gesprekken konden niet worden geladen.",
            );
          }

          setConversations(
            data.conversations ??
              [],
          );
        } catch (
          caughtError
        ) {
          setConversations(
            [],
          );

          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Gesprekken konden niet worden geladen.",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        context.organizationId,
      ],
    );


  const markRead =
    useCallback(
      async (
        threadId: string,
      ) => {
        try {
          await fetch(
            "/api/communication",
            {
              method:
                "POST",

              headers: {
                "content-type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  action:
                    "read",

                  threadId,
                }),
            },
          );
        } catch {
          // Leesstatus mag de chat
          // nooit blokkeren.
        }
      },
      [],
    );


  const loadThread =
    useCallback(
      async (
        threadId: string,
      ) => {
        setThreadLoading(
          true,
        );

        setError("");

        try {
          const response =
            await fetch(
              `/api/communication?organizationId=${encodeURIComponent(
                context.organizationId,
              )}&threadId=${encodeURIComponent(
                threadId,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            await response.json() as {
              conversation?:
                ConversationDetail;

              messages?:
                CommunicationMessage[];

              currentUserId?:
                string;

              error?: string;
            };

          if (
            !response.ok ||
            !data.conversation
          ) {
            throw new Error(
              data.error ||
                "Het gesprek kon niet worden geladen.",
            );
          }

          setDetail(
            data.conversation,
          );

          setMessages(
            data.messages ??
              [],
          );

          void markRead(
            threadId,
          );

          window.setTimeout(
            () => {
              bottomRef.current
                ?.scrollIntoView({
                  block:
                    "nearest",
                });
            },
            0,
          );
        } catch (
          caughtError
        ) {
          setDetail(null);
          setMessages([]);

          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Het gesprek kon niet worden geladen.",
          );
        } finally {
          setThreadLoading(
            false,
          );
        }
      },
      [
        context.organizationId,
        markRead,
      ],
    );


  useEffect(() => {
    void loadConversations();
  }, [
    loadConversations,
  ]);


  useEffect(() => {
    const url =
      new URL(
        window.location.href,
      );

    const requested =
      url.searchParams.get(
        "thread",
      );

    if (requested) {
      setSelectedId(
        requested,
      );
    }
  }, []);


  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setMessages([]);
      return;
    }

    updateUrl(
      selectedId,
    );

    void loadThread(
      selectedId,
    );
  }, [
    selectedId,
    loadThread,
    updateUrl,
  ]);


  async function createThread(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (
      !newOrganizationId
    ) {
      setError(
        "Selecteer eerst een onderneming.",
      );
      return;
    }

    setSending(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/communication",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "create",

                organizationId:
                  newOrganizationId,

                subject,

                body:
                  newBody,

                idempotencyKey:
                  crypto.randomUUID(),
              }),
          },
        );

      const data =
        await response.json() as {
          conversationId?: string;
          error?: string;
        };

      if (
        !response.ok ||
        !data.conversationId
      ) {
        throw new Error(
          data.error ||
            "Het gesprek kon niet worden gestart.",
        );
      }

      setSubject("");
      setNewBody("");
      setNewOpen(false);

      await loadConversations();

      setSelectedId(
        data.conversationId,
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Het gesprek kon niet worden gestart.",
      );
    } finally {
      setSending(false);
    }
  }


  async function sendReply(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (
      !selectedId ||
      !reply.trim()
    ) {
      return;
    }

    const outgoing =
      reply.trim();

    setSending(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/communication",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  "message",

                threadId:
                  selectedId,

                body:
                  outgoing,

                idempotencyKey:
                  crypto.randomUUID(),
              }),
          },
        );

      const data =
        await response.json() as {
          messageId?: string;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Het bericht kon niet worden verzonden.",
        );
      }

      setReply("");

      await Promise.all([
        loadThread(
          selectedId,
        ),
        loadConversations(),
      ]);
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Het bericht kon niet worden verzonden.",
      );
    } finally {
      setSending(false);
    }
  }


  function closeThreadMobile() {
    setSelectedId(null);
    updateUrl(null);
  }


  return (
    <section className="communication-page">
      <div className="communication-heading">
        <div>
          <p className="customer-dashboard-eyebrow">
            Mijn Bestemming
          </p>

          <h1>
            Communicatie
          </h1>

          <p>
            Stel je vraag aan Bestemd en
            houd alle berichten veilig op
            één plek.
          </p>
        </div>

        <button
          type="button"
          className="btn primary communication-new-button"
          onClick={() =>
            setNewOpen(
              (current) =>
                !current,
            )
          }
        >
          <Plus />

          Nieuw gesprek
        </button>
      </div>


      {error && (
        <div
          className="notice communication-error"
          role="alert"
        >
          {error}
        </div>
      )}


      {newOpen && (
        <form
          className="communication-new-card"
          onSubmit={
            createThread
          }
        >
          <div>
            <p className="customer-section-label">
              NIEUW GESPREK
            </p>

            <h2>
              Waar kunnen we je mee helpen?
            </h2>
          </div>

          {context.organizations.length >
            1 && (
            <label>
              Onderneming

              <select
                value={
                  newOrganizationId
                }
                onChange={(
                  event,
                ) =>
                  setNewOrganizationId(
                    event.target
                      .value,
                  )
                }
                disabled={
                  sending
                }
              >
                {context.organizations.map(
                  (item) => (
                    <option
                      key={
                        item.id
                      }
                      value={
                        item.id
                      }
                    >
                      {
                        item.name
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
          )}

          {context.organizations.length ===
            1 && (
            <div className="communication-selected-company">
              {
                selectedOrganization
                  ?.name
              }
            </div>
          )}

          <label>
            Onderwerp

            <input
              type="text"
              value={
                subject
              }
              onChange={(
                event,
              ) =>
                setSubject(
                  event.target
                    .value,
                )
              }
              maxLength={
                160
              }
              required
              disabled={
                sending
              }
              placeholder="Bijvoorbeeld: vraag over mijn BTW-aangifte"
            />
          </label>

          <label>
            Bericht

            <textarea
              value={
                newBody
              }
              onChange={(
                event,
              ) =>
                setNewBody(
                  event.target
                    .value,
                )
              }
              maxLength={
                5000
              }
              required
              disabled={
                sending
              }
              placeholder="Typ hier je bericht..."
            />
          </label>

          <div className="communication-new-actions">
            <button
              type="button"
              className="btn"
              disabled={
                sending
              }
              onClick={() =>
                setNewOpen(
                  false,
                )
              }
            >
              Annuleren
            </button>

            <button
              type="submit"
              className="btn primary"
              disabled={
                sending
              }
            >
              {sending
                ? "Versturen..."
                : "Gesprek starten"}
            </button>
          </div>
        </form>
      )}


      <div
        className={
          selectedId
            ? "communication-shell has-thread"
            : "communication-shell"
        }
      >
        <aside className="communication-list-panel">
          <div className="communication-list-head">
            <div>
              <span>
                Gesprekken
              </span>

              <strong>
                {
                  conversations.length
                }
              </strong>
            </div>
          </div>

          <div className="communication-thread-list">
            {loading ? (
              <div className="communication-empty">
                Gesprekken laden...
              </div>
            ) : conversations.length ===
              0 ? (
              <div className="communication-empty">
                <MessageCircleMore />

                <strong>
                  Nog geen gesprekken
                </strong>

                <span>
                  Start een gesprek als je
                  een vraag voor Bestemd
                  hebt.
                </span>
              </div>
            ) : (
              conversations.map(
                (item) => (
                  <button
                    type="button"
                    key={
                      item.id
                    }
                    className={
                      selectedId ===
                      item.id
                        ? "communication-thread active"
                        : "communication-thread"
                    }
                    onClick={() =>
                      setSelectedId(
                        item.id,
                      )
                    }
                  >
                    <div className="communication-thread-top">
                      <strong>
                        {
                          item.subject
                        }
                      </strong>

                      <time>
                        {formatDateTime(
                          item.last_message_at ??
                            item.created_at,
                        )}
                      </time>
                    </div>

                    <span className="communication-thread-company">
                      {
                        item.organization_name
                      }
                    </span>

                    <p>
                      {item.latest_message
                        ? `${
                            item.latest_message
                              .sender_side ===
                            "office"
                              ? "Bestemd: "
                              : "Jij: "
                          }${preview(
                            item.latest_message
                              .body,
                          )}`
                        : "Nog geen berichten"}
                    </p>
                  </button>
                ),
              )
            )}
          </div>
        </aside>


        <div className="communication-chat-panel">
          {!selectedId ? (
            <div className="communication-chat-empty">
              <MessageCircleMore />

              <h2>
                Selecteer een gesprek
              </h2>

              <p>
                Kies links een bestaand
                gesprek of start een nieuw
                gesprek met Bestemd.
              </p>
            </div>
          ) : threadLoading ? (
            <div className="communication-chat-empty">
              Gesprek laden...
            </div>
          ) : detail ? (
            <>
              <header className="communication-chat-head">
                <button
                  type="button"
                  className="communication-mobile-back"
                  onClick={
                    closeThreadMobile
                  }
                  aria-label="Terug naar gesprekken"
                >
                  <ArrowLeft />
                </button>

                <div>
                  <h2>
                    {
                      detail.subject
                    }
                  </h2>

                  <p>
                    {
                      detail.organization_name
                    }
                  </p>
                </div>

                <span className="communication-status">
                  {detail.status ===
                  "open"
                    ? "Open"
                    : "Gesloten"}
                </span>
              </header>


              <div className="communication-messages">
                {messages.map(
                  (message) => {
                    const mine =
                      message.sender_id ===
                      context.profile.id;

                    const label =
                      message.sender_side ===
                      "office"
                        ? "Bestemd"
                        : mine
                          ? "Jij"
                          : "Jouw organisatie";

                    return (
                      <article
                        key={
                          message.id
                        }
                        className={
                          message.sender_side ===
                          "office"
                            ? "communication-message office"
                            : "communication-message customer"
                        }
                      >
                        <div className="communication-message-meta">
                          <strong>
                            {
                              label
                            }
                          </strong>

                          <time>
                            {formatDateTime(
                              message.created_at,
                            )}
                          </time>
                        </div>

                        <p>
                          {
                            message.body
                          }
                        </p>
                      </article>
                    );
                  },
                )}

                <div
                  ref={
                    bottomRef
                  }
                />
              </div>


              {detail.status ===
              "open" ? (
                <form
                  className="communication-composer"
                  onSubmit={
                    sendReply
                  }
                >
                  <textarea
                    value={
                      reply
                    }
                    onChange={(
                      event,
                    ) =>
                      setReply(
                        event.target
                          .value,
                      )
                    }
                    placeholder="Typ je bericht..."
                    maxLength={
                      5000
                    }
                    disabled={
                      sending
                    }
                    required
                  />

                  <button
                    type="submit"
                    className="communication-send"
                    aria-label="Bericht versturen"
                    disabled={
                      sending ||
                      !reply.trim()
                    }
                  >
                    <Send />
                  </button>
                </form>
              ) : (
                <div className="communication-closed">
                  Dit gesprek is gesloten.
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
