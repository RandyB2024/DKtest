const escapeHtml =
  value =>
    String(value ?? '')
      .replace(
        /[&<>"']/g,
        character => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]
      );

const euro =
  new Intl.NumberFormat(
    'nl-NL',
    {
      style:
        'currency',
      currency:
        'EUR',
    }
  );

const dateFormatter =
  new Intl.DateTimeFormat(
    'nl-NL',
    {
      day:
        '2-digit',
      month:
        '2-digit',
      year:
        'numeric',
    }
  );

function money(cents) {
  return euro.format(
    Number(cents ?? 0) / 100
  );
}

function date(value) {
  if (!value) return '?';

  return dateFormatter.format(
    new Date(value)
  );
}

function statusFor(
  transaction,
  suggestion,
  documentRequest
) {
  if (
    transaction.reconciliationStatus ===
      'matched'
    || transaction.paymentId
  ) {
    return 'matched';
  }

  if (
    documentRequest?.status ===
      'received'
  ) {
    return 'document_received';
  }

  if (
    documentRequest?.status ===
      'requested'
  ) {
    return 'document_requested';
  }

  if (suggestion?.suggestion) {
    return 'suggested';
  }

  if (
    Number(
      transaction.amountCents
    ) < 0
  ) {
    return 'missing_document';
  }

  return 'review';
}

function statusLabel(status) {
  switch (status) {
    case 'matched':
      return 'Gekoppeld';

    case 'suggested':
      return 'Matchvoorstel';

    case 'missing_document':
      return 'Factuur ontbreekt';

    case 'document_requested':
      return 'Factuur opgevraagd';

    case 'document_received':
      return 'Factuur ontvangen';

    default:
      return 'Te beoordelen';
  }
}

export function mountOfficeBanking(
  root,
  api,
  data
) {
  const organizations =
    Array.isArray(
      data?.organizations
    )
      ? data.organizations
      : [];

  root.innerHTML = `
    <section class="panel office-banking-shell">
      <div class="office-bank-heading">
        <div>
          <p class="eyebrow">
            Administratie
          </p>

          <h2>
            Bankmutaties verwerken
          </h2>

          <p class="muted">
            Controleer automatische
            factuurmatches en bevestig
            de definitieve boeking.
          </p>
        </div>

        <button
          type="button"
          id="bank-refresh"
        >
          Vernieuwen
        </button>
      </div>

      <div class="office-bank-toolbar">
        <label>
          Onderneming

          <select
            id="bank-organization"
          >
            ${organizations.map(
              organization => `
                <option
                  value="${escapeHtml(
                    organization.id
                  )}"
                >
                  ${escapeHtml(
                    organization.name
                  )}
                </option>
              `
            ).join('')}
          </select>
        </label>

        <label>
          Filter

          <select
            id="bank-filter"
          >
            <option value="all">
              Alle bankmutaties
            </option>

            <option value="suggested">
              Matchvoorstellen
            </option>

            <option value="missing_document">
              Factuur ontbreekt
            </option>

            <option value="review">
              Te beoordelen
            </option>

            <option value="matched">
              Gekoppeld
            </option>
          </select>
        </label>

        <label class="office-bank-search">
          Zoeken

          <input
            id="bank-search"
            type="search"
            placeholder="Naam, omschrijving of referentie"
          >
        </label>
      </div>

      <p
        id="bank-status"
        class="small-copy"
        role="status"
      ></p>

      <div
        id="bank-summary"
        class="office-bank-summary"
      ></div>

      <div
        id="bank-list"
      ></div>
    </section>
  `;

  const organizationSelect =
    root.querySelector(
      '#bank-organization'
    );

  const filterSelect =
    root.querySelector(
      '#bank-filter'
    );

  const searchInput =
    root.querySelector(
      '#bank-search'
    );

  const status =
    root.querySelector(
      '#bank-status'
    );

  const summary =
    root.querySelector(
      '#bank-summary'
    );

  const list =
    root.querySelector(
      '#bank-list'
    );

  const refresh =
    root.querySelector(
      '#bank-refresh'
    );

  let current = null;
  let requestVersion = 0;

  if (!organizations.length) {
    status.textContent =
      'Er zijn geen ondernemingen beschikbaar.';

    organizationSelect.disabled =
      true;

    filterSelect.disabled =
      true;

    searchInput.disabled =
      true;

    refresh.disabled =
      true;

    return;
  }

  function suggestionMap() {
    return new Map(
      (
        current?.suggestions ??
        []
      ).map(
        suggestion => [
          suggestion.transactionId,
          suggestion,
        ]
      )
    );
  }

  function documentRequestMap() {
    const map =
      new Map();

    for (
      const request of
      current?.documentRequests ??
      []
    ) {
      if (
        !map.has(
          request.bank_transaction_id
        )
      ) {
        map.set(
          request.bank_transaction_id,
          request
        );
      }
    }

    return map;
  }

  function filteredItems() {
    const map =
      suggestionMap();

    const requestMap =
      documentRequestMap();

    const filter =
      filterSelect.value;

    const search =
      searchInput.value
        .trim()
        .toLowerCase();

    return (
      current?.transactions
        ?.items ?? []
    ).filter(
      transaction => {
        const suggestion =
          map.get(
            transaction.id
          );

        const state =
          statusFor(
            transaction,
            suggestion,
            requestMap.get(
              transaction.id
            )
          );

        if (
          filter !== 'all'
          && state !== filter
        ) {
          return false;
        }

        if (!search) {
          return true;
        }

        return [
          transaction
            .counterpartyName,
          transaction
            .counterpartyIban,
          transaction
            .description,
          transaction
            .reference,
          suggestion
            ?.suggestion
            ?.invoiceNumber,
          suggestion
            ?.suggestion
            ?.relationName,
        ]
          .filter(Boolean)
          .some(
            value =>
              String(value)
                .toLowerCase()
                .includes(
                  search
                )
          );
      }
    );
  }

  function renderSummary() {
    const map =
      suggestionMap();

    const requestMap =
      documentRequestMap();

    const counts = {
      total: 0,
      suggested: 0,
      missing_document: 0,
      document_requested: 0,
      document_received: 0,
      review: 0,
      matched: 0,
    };

    for (
      const transaction of
      current?.transactions
        ?.items ?? []
    ) {
      const state =
        statusFor(
          transaction,
          map.get(
            transaction.id
          ),
          requestMap.get(
            transaction.id
          )
        );

      counts.total += 1;
      counts[state] += 1;
    }

    summary.innerHTML = `
      <article>
        <span>
          Bankmutaties
        </span>
        <strong>
          ${counts.total}
        </strong>
      </article>

      <article>
        <span>
          Matchvoorstellen
        </span>
        <strong>
          ${counts.suggested}
        </strong>
      </article>

      <article>
        <span>
          Factuur ontbreekt
        </span>
        <strong>
          ${counts.missing_document}
        </strong>
      </article>

      <article>
        <span>
          Gekoppeld
        </span>
        <strong>
          ${counts.matched}
        </strong>
      </article>
    `;
  }

  async function confirmMatch(
    transaction,
    suggestion,
    button
  ) {
    if (
      !suggestion?.suggestion
    ) {
      return;
    }

    const match =
      suggestion.suggestion;

    const approved =
      window.confirm(
        `Bankmutatie ${money(
          Math.abs(
            transaction.amountCents
          )
        )} koppelen aan ${match.invoiceNumber}?`
      );

    if (!approved) return;

    button.disabled = true;

    status.textContent =
      'Bankmatch verwerken...';

    try {
      await api(
        '/api/banking/confirm',
        {
          organizationId:
            organizationSelect.value,

          transactionId:
            transaction.id,

          invoiceId:
            match.invoiceId,

          invoiceType:
            match.invoiceType,
        }
      );

      status.textContent =
        `Bankmutatie gekoppeld aan ${match.invoiceNumber}.`;

      await load();
    } catch (error) {
      status.textContent =
        error.message ||
        'De bankmatch kon niet worden verwerkt.';
    } finally {
      button.disabled =
        false;
    }
  }

  function render() {
    if (!current) return;

    renderSummary();

    const map =
      suggestionMap();

    const requestMap =
      documentRequestMap();

    const items =
      filteredItems();

    if (!items.length) {
      list.innerHTML = `
        <div class="office-bank-empty">
          <strong>
            Geen bankmutaties
          </strong>

          <span>
            Er zijn geen mutaties die
            aan dit filter voldoen.
          </span>
        </div>
      `;

      return;
    }

    list.innerHTML = `
      <div class="office-bank-list">
        ${items.map(
          transaction => {
            const suggestion =
              map.get(
                transaction.id
              );

            const match =
              suggestion
                ?.suggestion ??
              null;

            const request =
              requestMap.get(
                transaction.id
              );

            const state =
              statusFor(
                transaction,
                suggestion,
                request
              );

            const incoming =
              Number(
                transaction.amountCents
              ) > 0;

            return `
              <article
                class="office-bank-row"
                data-transaction="${escapeHtml(
                  transaction.id
                )}"
              >
                <div
                  class="office-bank-direction ${
                    incoming
                      ? 'incoming'
                      : 'outgoing'
                  }"
                >
                  ${
                    incoming
                      ? '?'
                      : '?'
                  }
                </div>

                <div class="office-bank-main">
                  <strong>
                    ${escapeHtml(
                      transaction
                        .counterpartyName
                      || 'Onbekende tegenpartij'
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(
                      transaction
                        .description
                      || transaction
                        .reference
                      || 'Geen omschrijving'
                    )}
                  </span>

                  <small>
                    ${escapeHtml(
                      date(
                        transaction.bookedAt
                      )
                    )}
                    ?
                    ${escapeHtml(
                      transaction
                        .bankAccount
                        ?.name
                      || ''
                    )}
                  </small>
                </div>

                <div class="office-bank-amount">
                  <strong>
                    ${escapeHtml(
                      money(
                        transaction
                          .amountCents
                      )
                    )}
                  </strong>

                  ${
                    transaction
                      .counterpartyIban
                      ? `<small>${escapeHtml(
                          transaction
                            .counterpartyIban
                        )}</small>`
                      : ''
                  }
                </div>

                <div>
                  <span
                    class="office-bank-state ${state}"
                  >
                    ${escapeHtml(
                      statusLabel(
                        state
                      )
                    )}
                  </span>
                </div>

                <div class="office-bank-actions">
                  ${
                    state ===
                      'suggested'
                      && match
                      ? `
                        <button
                          type="button"
                          data-confirm="${escapeHtml(
                            transaction.id
                          )}"
                          class="primary"
                          ${current.canConfirm
                            ? ''
                            : 'disabled'}
                        >
                          Match bevestigen
                        </button>
                      `
                      : state ===
                          'missing_document'
                        ? `
                          <button
                            type="button"
                            data-request-invoice="${escapeHtml(
                              transaction.id
                            )}"
                            class="primary"
                            ${current.canConfirm
                              ? ''
                              : 'disabled'}
                          >
                            Factuur opvragen
                          </button>
                        `
                        : state ===
                            'document_requested'
                          ? `
                            <span class="office-bank-done">
                              Wacht op klant
                            </span>
                          `
                        : state ===
                            'document_received'
                          ? `
                            <button
                              type="button"
                              data-open-document="${escapeHtml(
                                request?.document_id || ''
                              )}"
                              class="primary"
                              ${request?.document_id
                                ? ''
                                : 'disabled'}
                            >
                              Document bekijken
                            </button>
                          `
                        : state ===
                            'matched'
                          ? `
                            <span class="office-bank-done">
                              Afgerond
                            </span>
                          `
                          : `
                            <span class="office-bank-done">
                              Controle nodig
                            </span>
                          `
                  }
                </div>

                ${
                  match
                    ? `
                      <div class="office-bank-match">
                        <div>
                          <span>
                            Voorgestelde factuur
                          </span>

                          <strong>
                            ${escapeHtml(
                              match.invoiceNumber
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Relatie
                          </span>

                          <strong>
                            ${escapeHtml(
                              match.relationName
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Type
                          </span>

                          <strong>
                            ${
                              match.invoiceType ===
                                'sales'
                                ? 'Verkoopfactuur'
                                : 'Inkoopfactuur'
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Matchscore
                          </span>

                          <strong>
                            ${escapeHtml(
                              match.score
                            )}/100
                          </strong>
                        </div>

                        <p>
                          ${escapeHtml(
                            match.reason
                          )}
                        </p>
                      </div>
                    `
                    : ''
                }
              </article>
            `;
          }
        ).join('')}
      </div>
    `;

    const byId =
      new Map(
        (
          current.transactions
            ?.items ?? []
        ).map(
          transaction => [
            transaction.id,
            transaction,
          ]
        )
      );

    list
      .querySelectorAll(
        '[data-confirm]'
      )
      .forEach(
        button => {
          button.onclick =
            () => {
              const id =
                button.dataset
                  .confirm;

              const transaction =
                byId.get(id);

              const suggestion =
                map.get(id);

              if (
                transaction
                && suggestion
              ) {
                void confirmMatch(
                  transaction,
                  suggestion,
                  button
                );
              }
            };
        }
      );

    list
      .querySelectorAll(
        '[data-open-document]'
      )
      .forEach(
        button => {
          button.onclick =
            async () => {
              const documentId =
                button.dataset
                  .openDocument;

              if (!documentId) {
                return;
              }

              button.disabled =
                true;

              status.textContent =
                'Document veilig openen...';

              try {
                const result =
                  await api(
                    `/api/documents/${encodeURIComponent(
                      documentId
                    )}/download?organizationId=${encodeURIComponent(
                      organizationSelect.value
                    )}`
                  );

                if (!result?.url) {
                  throw new Error(
                    'Het document kon niet worden geopend.'
                  );
                }

                window.open(
                  result.url,
                  '_blank',
                  'noopener,noreferrer'
                );

                status.textContent =
                  'Document geopend.';
              } catch (error) {
                status.textContent =
                  error.message
                  || 'Het document kon niet worden geopend.';
              } finally {
                button.disabled =
                  false;
              }
            };
        }
      );

    list
      .querySelectorAll(
        '[data-request-invoice]'
      )
      .forEach(
        button => {
          button.onclick =
            async () => {
              const id =
                button.dataset
                  .requestInvoice;

              const transaction =
                byId.get(id);

              if (!transaction) {
                return;
              }

              const approved =
                window.confirm(
                  `Factuur opvragen voor ${money(
                    Math.abs(
                      transaction.amountCents
                    )
                  )} aan ${
                    transaction.counterpartyName
                    || 'deze leverancier'
                  }?`
                );

              if (!approved) {
                return;
              }

              button.disabled =
                true;

              status.textContent =
                'Factuurverzoek versturen...';

              try {
                const result =
                  await api(
                    '/api/banking/request-invoice',
                    {
                      organizationId:
                        organizationSelect.value,

                      transactionId:
                        transaction.id,
                    }
                  );

                status.textContent =
                  `Factuur opgevraagd bij ${result.recipientEmail}.`;

                button.textContent =
                  'Factuur opgevraagd';

                button.classList
                  .remove('primary');

                button.disabled =
                  true;
              } catch (error) {
                status.textContent =
                  error.message
                  || 'Het factuurverzoek kon niet worden verstuurd.';

                button.disabled =
                  false;
              }
            };
        }
      );
  }

  async function load() {
    const organizationId =
      organizationSelect.value;

    const version =
      ++requestVersion;

    status.textContent =
      'Bankgegevens veilig ophalen...';

    list.innerHTML = `
      <div class="office-bank-empty">
        <span>
          Bankmutaties laden...
        </span>
      </div>
    `;

    try {
      const result =
        await api(
          `/api/banking?organizationId=${encodeURIComponent(
            organizationId
          )}`
        );

      if (
        version !==
        requestVersion
      ) {
        return;
      }

      current =
        result;

      status.textContent =
        `${result.transactions?.items?.length ?? 0} bankmutaties geladen.`;

      render();
    } catch (error) {
      if (
        version !==
        requestVersion
      ) {
        return;
      }

      current = null;

      summary.replaceChildren();

      list.innerHTML = `
        <p
          class="mutation-error"
          role="alert"
        >
          ${escapeHtml(
            error.message
            || 'Bankgegevens konden niet worden geladen.'
          )}
        </p>
      `;

      status.textContent = '';
    }
  }

  organizationSelect
    .addEventListener(
      'change',
      () => void load()
    );

  filterSelect
    .addEventListener(
      'change',
      render
    );

  searchInput
    .addEventListener(
      'input',
      render
    );

  refresh
    .addEventListener(
      'click',
      () => void load()
    );

  void load();
}
