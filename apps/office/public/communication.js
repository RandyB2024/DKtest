function esc(value) {
  return String(
    value ?? ''
  )
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function dateTime(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(
    'nl-NL',
    {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }
  ).format(
    new Date(value)
  );
}

function preview(value) {
  const clean =
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  return clean.length > 105
    ? clean.slice(0, 102) + '...'
    : clean;
}

export async function mountOfficeCommunication(
  root,
  api,
  user
) {
  let scope = 'active';
  let selectedId = null;
  let conversations = [];
  let organizations = [];
  let canWrite = false;
  let busy = false;


  root.innerHTML = `
    <section class="office-communication">

      <div class="office-communication-intro">
        <div>
          <p class="eyebrow">
            KLANTCONTACT
          </p>

          <h2>
            Communicatie
          </h2>

          <p>
            Alle berichten tussen Bestemd en klanten op één veilige plek.
          </p>
        </div>

        <button
          type="button"
          class="primary"
          data-new-thread
        >
          Nieuw gesprek
        </button>
      </div>

      <div
        class="office-communication-tabs"
        role="tablist"
      >
        <button
          type="button"
          class="active"
          data-scope="active"
        >
          Inbox
        </button>

        <button
          type="button"
          data-scope="archive"
        >
          Archief
        </button>
      </div>

      <p
        class="office-communication-error"
        role="alert"
      ></p>

      <div
        class="office-communication-shell"
      >
        <aside
          class="office-communication-list"
        >
          <div class="office-communication-list-head">
            <strong data-list-title>
              Actieve gesprekken
            </strong>

            <span data-count>
              0
            </span>
          </div>

          <div data-thread-list></div>
        </aside>

        <section
          class="office-communication-chat"
          data-chat
        >
          <div class="office-communication-empty">
            Selecteer een gesprek.
          </div>
        </section>
      </div>

    </section>
  `;


  const list =
    root.querySelector(
      '[data-thread-list]'
    );

  const chat =
    root.querySelector(
      '[data-chat]'
    );

  const errorBox =
    root.querySelector(
      '.office-communication-error'
    );

  const count =
    root.querySelector(
      '[data-count]'
    );

  const listTitle =
    root.querySelector(
      '[data-list-title]'
    );

  const newButton =
    root.querySelector(
      '[data-new-thread]'
    );


  function showError(message = '') {
    errorBox.textContent =
      message;
  }


  async function loadOrganizations() {
    const data =
      await api(
        '/api/clients'
      );

    organizations =
      data.organizations ?? [];
  }


  function renderList() {
    count.textContent =
      String(
        conversations.length
      );

    listTitle.textContent =
      scope === 'active'
        ? 'Actieve gesprekken'
        : 'Archief';


    if (!conversations.length) {
      list.innerHTML = `
        <div class="office-communication-empty">
          ${
            scope === 'active'
              ? 'Geen actieve gesprekken.'
              : 'Het archief is leeg.'
          }
        </div>
      `;

      return;
    }


    list.innerHTML =
      conversations
        .map(
          item => `
            <button
              type="button"
              class="office-thread ${
                selectedId ===
                item.id
                  ? 'active'
                  : ''
              }"
              data-thread="${esc(
                item.id
              )}"
            >
              <div class="office-thread-top">
                <strong>
                  ${esc(
                    item.subject
                  )}
                </strong>

                <time>
                  ${esc(
                    dateTime(
                      item.last_message_at ??
                      item.created_at
                    )
                  )}
                </time>
              </div>

              <span class="office-thread-company">
                ${esc(
                  item.organization_name
                )}
              </span>

              <p>
                ${
                  item.latest_message
                    ? esc(
                        (
                          item.latest_message
                            .sender_side ===
                          'office'
                            ? 'Bestemd: '
                            : 'Klant: '
                        ) +
                          preview(
                            item.latest_message
                              .body
                          )
                      )
                    : 'Nog geen berichten'
                }
              </p>
            </button>
          `
        )
        .join('');


    list
      .querySelectorAll(
        '[data-thread]'
      )
      .forEach(
        button => {
          button.onclick =
            () => openThread(
              button.dataset.thread
            );
        }
      );
  }


  async function loadList() {
    showError('');

    const data =
      await api(
        `/api/communication?scope=${encodeURIComponent(
          scope
        )}`
      );

    conversations =
      data.conversations ?? [];

    canWrite =
      data.canWrite === true;

    newButton.hidden =
      !canWrite;

    renderList();
  }


  async function markRead(
    threadId
  ) {
    if (!canWrite) {
      return;
    }

    try {
      await api(
        '/api/communication',
        {
          action: 'read',
          threadId,
        }
      );
    } catch {
      // Leesstatus mag de
      // gesprekweergave niet blokkeren.
    }
  }


  async function openThread(
    threadId
  ) {
    selectedId =
      threadId;

    renderList();

    chat.innerHTML = `
      <div class="office-communication-empty">
        Gesprek laden...
      </div>
    `;

    showError('');


    try {
      const data =
        await api(
          `/api/communication?threadId=${encodeURIComponent(
            threadId
          )}`
        );

      canWrite =
        data.canWrite === true;

      renderThread(
        data.conversation,
        data.messages ?? []
      );

      await markRead(
        threadId
      );

      const url =
        new URL(
          location.href
        );

      url.searchParams.set(
        'thread',
        threadId
      );

      history.replaceState(
        {},
        '',
        url
      );
    } catch (error) {
      showError(
        error.message
      );

      chat.innerHTML = `
        <div class="office-communication-empty">
          Gesprek kon niet worden geladen.
        </div>
      `;
    }
  }


  function renderThread(
    conversation,
    messages
  ) {
    const closed =
      conversation.status ===
      'closed';


    chat.innerHTML = `
      <header class="office-chat-head">

        <button
          type="button"
          class="office-chat-back"
          data-back
          aria-label="Terug naar gesprekken"
        >
          ←
        </button>

        <div>
          <h3>
            ${esc(
              conversation.subject
            )}
          </h3>

          <p>
            ${esc(
              conversation.organization_name
            )}
          </p>
        </div>

        <div class="office-chat-actions">

          <span class="badge ${
            closed
              ? 'afgerond'
              : 'nieuw'
          }">
            ${
              closed
                ? 'Afgerond'
                : 'Open'
            }
          </span>

          ${
            canWrite
              ? closed
                ? `
                  <button
                    type="button"
                    data-reopen
                  >
                    Heropenen
                  </button>
                `
                : `
                  <button
                    type="button"
                    data-close
                  >
                    Gesprek afronden
                  </button>
                `
              : ''
          }

        </div>
      </header>

      <div
        class="office-chat-messages"
        data-messages
      >
        ${
          messages
            .map(
              message => `
                <article class="office-chat-message ${
                  message.sender_side ===
                  'office'
                    ? 'office'
                    : 'customer'
                }">

                  <div>
                    <strong>
                      ${esc(
                        message.sender_side ===
                        'office'
                          ? message.sender_name
                          : message.sender_name ||
                            'Klant'
                      )}
                    </strong>

                    <time>
                      ${esc(
                        dateTime(
                          message.created_at
                        )
                      )}
                    </time>
                  </div>

                  <p>
                    ${esc(
                      message.body
                    )}
                  </p>

                </article>
              `
            )
            .join('')
        }
      </div>

      ${
        closed
          ? `
            <div class="office-chat-archived">
              <strong>
                Gesprek afgerond
              </strong>

              <span>
                ${
                  conversation.closed_at
                    ? `Afgesloten op ${esc(
                        dateTime(
                          conversation.closed_at
                        )
                      )}.`
                    : 'Dit gesprek is afgesloten.'
                }
              </span>

              <small>
                De volledige correspondentie blijft bewaard in het archief.
              </small>
            </div>
          `
          : canWrite
            ? `
              <form
                class="office-chat-composer"
                data-reply-form
              >
                <textarea
                  name="message"
                  maxlength="5000"
                  placeholder="Typ een bericht aan de klant..."
                  required
                ></textarea>

                <button
                  type="submit"
                  class="primary"
                >
                  Versturen
                </button>
              </form>
            `
            : `
              <div class="office-chat-archived">
                Uw Office-rol heeft alleen leesrechten.
              </div>
            `
      }
    `;


    const messagesBox =
      chat.querySelector(
        '[data-messages]'
      );

    messagesBox.scrollTop =
      messagesBox.scrollHeight;


    chat.querySelector(
      '[data-back]'
    ).onclick =
      () => {
        selectedId = null;

        const url =
          new URL(
            location.href
          );

        url.searchParams.delete(
          'thread'
        );

        history.replaceState(
          {},
          '',
          url
        );

        chat.innerHTML = `
          <div class="office-communication-empty">
            Selecteer een gesprek.
          </div>
        `;

        renderList();
      };


    const closeButton =
      chat.querySelector(
        '[data-close]'
      );

    if (closeButton) {
      closeButton.onclick =
        async () => {
          if (
            !confirm(
              'Dit gesprek afronden en naar het archief verplaatsen?'
            )
          ) {
            return;
          }

          await threadAction(
            'close',
            conversation.id
          );
        };
    }


    const reopenButton =
      chat.querySelector(
        '[data-reopen]'
      );

    if (reopenButton) {
      reopenButton.onclick =
        async () => {
          if (
            !confirm(
              'Dit gesprek opnieuw openen?'
            )
          ) {
            return;
          }

          await threadAction(
            'reopen',
            conversation.id
          );
        };
    }


    const form =
      chat.querySelector(
        '[data-reply-form]'
      );

    if (form) {
      form.onsubmit =
        async event => {
          event.preventDefault();

          if (busy) {
            return;
          }

          const textarea =
            form.elements.message;

          const message =
            textarea.value.trim();

          if (!message) {
            return;
          }

          busy = true;

          form
            .querySelectorAll(
              'button,textarea'
            )
            .forEach(
              element =>
                element.disabled =
                  true
            );

          showError('');

          try {
            await api(
              '/api/communication',
              {
                action:
                  'message',

                threadId:
                  conversation.id,

                body:
                  message,

                idempotencyKey:
                  crypto.randomUUID(),
              }
            );

            textarea.value =
              '';

            await Promise.all([
              openThread(
                conversation.id
              ),
              loadList(),
            ]);
          } catch (error) {
            showError(
              error.message
            );
          } finally {
            busy = false;
          }
        };
    }
  }


  async function threadAction(
    action,
    threadId
  ) {
    if (busy) {
      return;
    }

    busy = true;
    showError('');

    try {
      await api(
        '/api/communication',
        {
          action,
          threadId,
        }
      );

      selectedId =
        null;

      scope =
        action === 'close'
          ? 'archive'
          : 'active';

      root
        .querySelectorAll(
          '[data-scope]'
        )
        .forEach(
          button =>
            button.classList.toggle(
              'active',
              button.dataset.scope ===
                scope
            )
        );

      chat.innerHTML = `
        <div class="office-communication-empty">
          ${
            action === 'close'
              ? 'Gesprek is afgerond en opgeslagen in het archief.'
              : 'Gesprek is opnieuw geopend.'
          }
        </div>
      `;

      await loadList();
    } catch (error) {
      showError(
        error.message
      );
    } finally {
      busy = false;
    }
  }


  function openNewDialog() {
    if (
      !canWrite
    ) {
      return;
    }

    const dialog =
      document.createElement(
        'dialog'
      );

    dialog.className =
      'office-communication-dialog';

    dialog.innerHTML = `
      <form method="dialog">

        <p class="eyebrow">
          NIEUW GESPREK
        </p>

        <h2>
          Bericht aan klant
        </h2>

        <label>
          Onderneming

          <select
            name="organizationId"
            required
          >
            <option value="">
              Kies onderneming
            </option>

            ${
              organizations
                .map(
                  organization => `
                    <option value="${esc(
                      organization.id
                    )}">
                      ${esc(
                        organization.name
                      )}
                    </option>
                  `
                )
                .join('')
            }
          </select>
        </label>

        <label>
          Onderwerp

          <input
            name="subject"
            maxlength="160"
            required
          >
        </label>

        <label>
          Bericht

          <textarea
            name="message"
            maxlength="5000"
            required
          ></textarea>
        </label>

        <p
          class="office-communication-dialog-error"
          role="alert"
        ></p>

        <div class="customer-buttons">
          <button
            type="submit"
            class="primary"
          >
            Versturen
          </button>

          <button
            type="button"
            data-cancel
          >
            Annuleren
          </button>
        </div>

      </form>
    `;


    document.body.append(
      dialog
    );


    dialog.querySelector(
      '[data-cancel]'
    ).onclick =
      () =>
        dialog.close();


    dialog.addEventListener(
      'close',
      () =>
        dialog.remove()
    );


    const form =
      dialog.querySelector(
        'form'
      );


    form.onsubmit =
      async event => {
        event.preventDefault();

        if (busy) {
          return;
        }

        busy = true;

        const data =
          new FormData(
            form
          );

        const errorTarget =
          dialog.querySelector(
            '.office-communication-dialog-error'
          );

        errorTarget.textContent =
          '';

        try {
          const result =
            await api(
              '/api/communication',
              {
                action:
                  'create',

                organizationId:
                  data.get(
                    'organizationId'
                  ),

                subject:
                  data.get(
                    'subject'
                  ),

                body:
                  data.get(
                    'message'
                  ),

                idempotencyKey:
                  crypto.randomUUID(),
              }
            );

          dialog.close();

          scope =
            'active';

          await loadList();

          if (
            result.conversationId
          ) {
            await openThread(
              result.conversationId
            );
          }
        } catch (error) {
          errorTarget.textContent =
            error.message;
        } finally {
          busy = false;
        }
      };


    dialog.showModal();
  }


  root
    .querySelectorAll(
      '[data-scope]'
    )
    .forEach(
      button => {
        button.onclick =
          async () => {
            scope =
              button.dataset.scope;

            selectedId =
              null;

            root
              .querySelectorAll(
                '[data-scope]'
              )
              .forEach(
                item =>
                  item.classList.toggle(
                    'active',
                    item === button
                  )
              );

            chat.innerHTML = `
              <div class="office-communication-empty">
                Selecteer een gesprek.
              </div>
            `;

            await loadList();
          };
      }
    );


  newButton.onclick =
    openNewDialog;


  try {
    await Promise.all([
      loadOrganizations(),
      loadList(),
    ]);

    const requested =
      new URL(
        location.href
      ).searchParams.get(
        'thread'
      );

    if (requested) {
      await openThread(
        requested
      );
    }
  } catch (error) {
    showError(
      error.message
    );
  }
}
