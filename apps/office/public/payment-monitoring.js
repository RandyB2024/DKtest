const euro =
  new Intl.NumberFormat(
    'nl-NL',
    {
      style: 'currency',
      currency: 'EUR',
    }
  );

const dateFormat =
  new Intl.DateTimeFormat(
    'nl-NL',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  );

const dateTimeFormat =
  new Intl.DateTimeFormat(
    'nl-NL',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );

function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function money(cents) {
  return euro.format(
    Number(cents ?? 0) / 100
  );
}

function date(value) {
  if (!value) return '—';

  return dateFormat.format(
    new Date(
      `${value}T12:00:00`
    )
  );
}

function dateTime(value) {
  if (!value) return '—';

  return dateTimeFormat.format(
    new Date(value)
  );
}

function statusLabel(value) {
  switch(value) {
    case 'paid':
      return 'Betaald';
    case 'overdue':
      return 'Vervallen';
    case 'reminder_1':
      return 'Herinnering 1';
    case 'reminder_2':
      return 'Herinnering 2';
    case 'final_notice':
      return 'Laatste herinnering';
    case 'failed':
      return 'Verzending mislukt';
    default:
      return 'Openstaand';
  }
}

function deliveryLabel(value) {
  switch(value) {
    case 'invoice':
      return 'Factuur verzonden';
    case 'reminder_1':
      return 'Herinnering 1';
    case 'reminder_2':
      return 'Herinnering 2';
    case 'final_notice':
      return 'Laatste herinnering';
    default:
      return value || 'Verzending';
  }
}

export async function mountPaymentMonitoring(
  root,
  api,
  data,
) {
  const organizations =
    Array.isArray(
      data?.organizations
    )
      ? data.organizations
      : [];

  root.innerHTML = `
    <section class="panel payment-monitoring">

      <div class="payment-monitoring-head">
        <div>
          <p class="eyebrow">
            Debiteuren
          </p>

          <h2>
            Betalingsbewaking
          </h2>

          <p class="muted">
            Bewaak openstaande facturen,
            vervaldata en automatische
            betalingsherinneringen.
          </p>
        </div>

        <button
          type="button"
          id="payment-monitoring-refresh"
        >
          Vernieuwen
        </button>
      </div>

      <div class="payment-monitoring-toolbar">

        <label>
          Onderneming

          <select
            id="payment-monitoring-organization"
          >
            <option value="">
              Alle ondernemingen
            </option>

            ${organizations.map(
              organization => `
                <option
                  value="${esc(
                    organization.id
                  )}"
                >
                  ${esc(
                    organization.name
                  )}
                </option>
              `
            ).join('')}
          </select>
        </label>

        <label>
          Status

          <select
            id="payment-monitoring-filter"
          >
            <option value="all">Alle</option>
            <option value="open">Openstaand</option>
            <option value="overdue">Vervallen</option>
            <option value="reminder_1">Herinnering 1</option>
            <option value="reminder_2">Herinnering 2</option>
            <option value="final_notice">Laatste herinnering</option>
            <option value="failed">Mislukte verzending</option>
            <option value="paid">Betaald</option>
          </select>
        </label>

        <label>
          Zoeken

          <input
            id="payment-monitoring-search"
            type="search"
            placeholder="Factuur, klant of debiteur"
          >
        </label>

      </div>

      <p
        id="payment-monitoring-status"
        class="small-copy"
        role="status"
      ></p>

      <div
        id="payment-monitoring-summary"
        class="payment-monitoring-summary"
      ></div>

      <div
        id="payment-monitoring-list"
      ></div>

    </section>
  `;

  const organization =
    root.querySelector(
      '#payment-monitoring-organization'
    );

  const filter =
    root.querySelector(
      '#payment-monitoring-filter'
    );

  const search =
    root.querySelector(
      '#payment-monitoring-search'
    );

  const status =
    root.querySelector(
      '#payment-monitoring-status'
    );

  const summary =
    root.querySelector(
      '#payment-monitoring-summary'
    );

  const list =
    root.querySelector(
      '#payment-monitoring-list'
    );

  const refresh =
    root.querySelector(
      '#payment-monitoring-refresh'
    );

  let current = null;
  let version = 0;

  const canCredit =
    [
      'owner',
      'admin',
      'accountant',
      'handler',
    ].includes(
      data?.user?.roleCode
    );

  function visibleItems() {
    const q =
      search.value
        .trim()
        .toLowerCase();

    return (
      current?.items ?? []
    ).filter(
      item => {
        if (
          filter.value !== 'all'
          && item.monitoringStatus !==
            filter.value
        ) {
          return false;
        }

        if (!q) {
          return true;
        }

        return [
          item.invoiceNumber,
          item.organizationName,
          item.debtorName,
          item.debtorEmail,
        ]
          .filter(Boolean)
          .some(
            value =>
              String(value)
                .toLowerCase()
                .includes(q)
          );
      }
    );
  }

  function renderSummary() {
    const value =
      current?.summary ?? {};

    summary.innerHTML = `
      <article>
        <span>Openstaand</span>
        <strong>${esc(money(value.openCents))}</strong>
        <small>${esc(value.openCount ?? 0)} facturen</small>
      </article>

      <article>
        <span>Vervallen</span>
        <strong>${esc(money(value.overdueCents))}</strong>
        <small>${esc(value.overdueCount ?? 0)} facturen</small>
      </article>

      <article>
        <span>Herinnering 1</span>
        <strong>${esc(value.reminder1Count ?? 0)}</strong>
      </article>

      <article>
        <span>Herinnering 2</span>
        <strong>${esc(value.reminder2Count ?? 0)}</strong>
      </article>

      <article>
        <span>Laatste herinnering</span>
        <strong>${esc(value.finalNoticeCount ?? 0)}</strong>
      </article>

      <article class="${
        Number(value.failedCount ?? 0) > 0
          ? 'payment-monitoring-alert'
          : ''
      }">
        <span>Mislukt</span>
        <strong>${esc(value.failedCount ?? 0)}</strong>
      </article>
    `;
  }

  function openCreditDialog(
    item,
  ) {
    if (!canCredit) {
      return;
    }

    if (
      root.querySelector(
        'dialog[data-credit-dialog]'
      )
    ) {
      return;
    }

    const dialog =
      document.createElement(
        'dialog'
      );

    dialog.dataset.creditDialog =
      'true';

    dialog.className =
      'customer-dialog';

    const form =
      document.createElement(
        'form'
      );

    const heading =
      document.createElement(
        'h2'
      );

    heading.textContent =
      'Creditfactuur maken';


    const explanation =
      document.createElement(
        'p'
      );

    explanation.className =
      'muted';

    explanation.textContent =
      `Factuur ${item.invoiceNumber} van ${item.debtorName} wordt volledig gecrediteerd. De oorspronkelijke factuur blijft in de administratie bewaard.`;


    const warning =
      document.createElement(
        'p'
      );

    warning.className =
      'profile-warning';

    warning.textContent =
      'Deze actie maakt een definitieve financiële correctie. De creditfactuur krijgt een eigen nummer en wordt na succesvolle verwerking per e-mail verzonden.';


    const label =
      document.createElement(
        'label'
      );

    label.textContent =
      'Reden creditfactuur';


    const textarea =
      document.createElement(
        'textarea'
      );

    textarea.name =
      'reason';

    textarea.required =
      true;

    textarea.maxLength =
      500;

    textarea.rows =
      5;

    textarea.placeholder =
      'Bijvoorbeeld: factuur ten onrechte verstuurd, opdracht geannuleerd of volledige correctie.';

    label.append(
      textarea
    );


    const error =
      document.createElement(
        'p'
      );

    error.className =
      'mutation-error';

    error.setAttribute(
      'role',
      'alert'
    );


    const statusMessage =
      document.createElement(
        'p'
      );

    statusMessage.setAttribute(
      'role',
      'status'
    );


    const actions =
      document.createElement(
        'div'
      );

    actions.className =
      'customer-buttons';


    const submit =
      document.createElement(
        'button'
      );

    submit.type =
      'submit';

    submit.className =
      'customer-action-danger';

    submit.textContent =
      'Creditfactuur maken';


    const cancel =
      document.createElement(
        'button'
      );

    cancel.type =
      'button';

    cancel.textContent =
      'Annuleren';


    actions.append(
      submit,
      cancel
    );


    form.append(
      heading,
      explanation,
      warning,
      label,
      error,
      statusMessage,
      actions
    );

    dialog.append(
      form
    );

    root.append(
      dialog
    );


    let pending =
      false;


    function close() {
      if (pending) {
        return;
      }

      dialog.close();
    }


    cancel.onclick =
      close;


    dialog.addEventListener(
      'cancel',
      event => {
        if (pending) {
          event.preventDefault();
        }
      }
    );


    dialog.addEventListener(
      'close',
      () => {
        dialog.remove();
      }
    );


    form.onsubmit =
      async event => {
        event.preventDefault();

        if (pending) {
          return;
        }

        const reason =
          textarea.value.trim();


        if (
          reason.length < 3
          || reason.length > 500
        ) {
          error.textContent =
            'Geef een duidelijke reden van minimaal 3 tekens op.';

          textarea.focus();

          return;
        }


        const confirmed =
          window.confirm(
            `Factuur ${item.invoiceNumber} volledig crediteren? Deze correctie wordt definitief vastgelegd.`
          );


        if (!confirmed) {
          return;
        }


        pending =
          true;

        error.textContent =
          '';

        statusMessage.textContent =
          'Creditfactuur wordt veilig aangemaakt...';

        textarea.disabled =
          true;

        submit.disabled =
          true;

        cancel.disabled =
          true;

        submit.textContent =
          'Bezig...';


        try {
          const result =
            await api(
              '/api/invoicing/credits',
              {
                organizationId:
                  item.organizationId,

                originalInvoiceId:
                  item.invoiceId,

                reason,

                idempotencyKey:
                  crypto.randomUUID(),
              },
              'POST'
            );


          const number =
            result.creditInvoiceNumber
            || 'de creditfactuur';


          if (
            result.emailStatus ===
            'unconfirmed'
          ) {
            statusMessage.textContent =
              `${number} is aangemaakt. De e-mailstatus is nog niet bevestigd; er wordt niet automatisch opnieuw verzonden.`;

          } else if (
            result.alreadySent
          ) {
            statusMessage.textContent =
              `${number} bestond al en was al verzonden.`;

          } else {
            statusMessage.textContent =
              `${number} is aangemaakt en verzonden.`;
          }


          /*
           * Betalingsbewaking opnieuw ophalen.
           * De originele factuur verdwijnt uit
           * actieve bewaking zodra deze gecrediteerd is.
           */
          await load();


          window.setTimeout(
            () => {
              if (
                dialog.isConnected
              ) {
                pending =
                  false;

                dialog.close();
              }
            },
            1400
          );

        } catch(caught) {
          error.textContent =
            caught instanceof Error
              ? caught.message
              : 'Creditfactuur kon niet worden verwerkt.';

          statusMessage.textContent =
            '';

          pending =
            false;

          textarea.disabled =
            false;

          submit.disabled =
            false;

          cancel.disabled =
            false;

          submit.textContent =
            'Creditfactuur maken';
        }
      };


    dialog.showModal();

    textarea.focus();
  }


  function render() {
    renderSummary();

    const items =
      visibleItems();

    if (!items.length) {
      list.innerHTML = `
        <div class="payment-monitoring-empty">
          <strong>Geen facturen gevonden</strong>
          <span>
            Er zijn geen facturen die
            aan dit filter voldoen.
          </span>
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <div class="payment-monitoring-table">

        <div class="payment-monitoring-row payment-monitoring-row--head">
          <span>Onderneming / debiteur</span>
          <span>Factuur</span>
          <span>Openstaand</span>
          <span>Vervaldatum</span>
          <span>Status</span>
          <span></span>
        </div>

        ${items.map(
          item => `
            <article
              class="payment-monitoring-row"
            >

              <div>
                <strong>
                  ${esc(item.organizationName)}
                </strong>

                <small>
                  ${esc(item.debtorName)}
                </small>
              </div>

              <div>
                <strong>
                  ${esc(item.invoiceNumber)}
                </strong>

                <small>
                  ${esc(date(item.invoiceDate))}
                </small>
              </div>

              <div>
                <strong>
                  ${esc(money(item.outstandingCents))}
                </strong>

                <small>
                  van ${esc(money(item.totalCents))}
                </small>
              </div>

              <div>
                <strong>
                  ${esc(date(item.dueDate))}
                </strong>

                ${
                  Number(item.daysOverdue) > 0
                    ? `
                      <small>
                        ${esc(item.daysOverdue)} dagen vervallen
                      </small>
                    `
                    : `
                      <small>
                        Binnen termijn
                      </small>
                    `
                }
              </div>

              <div>
                <span
                  class="payment-monitoring-state ${esc(
                    item.monitoringStatus
                  )}"
                >
                  ${esc(
                    statusLabel(
                      item.monitoringStatus
                    )
                  )}
                </span>

                ${
                  item.lastReminderAt
                    ? `
                      <small>
                        ${esc(
                          dateTime(
                            item.lastReminderAt
                          )
                        )}
                      </small>
                    `
                    : ''
                }
              </div>

              <div class="payment-monitoring-actions">
                <a
                  data-route
                  href="/organizations/${encodeURIComponent(
                    item.organizationId
                  )}"
                >
                  Klantdossier
                </a>

                ${
                  canCredit
                    ? `
                      <button
                        type="button"
                        data-credit-invoice="${esc(
                          item.invoiceId
                        )}"
                      >
                        Creditfactuur
                      </button>
                    `
                    : ''
                }
              </div>

              <details class="payment-monitoring-history">
                <summary>
                  Verzendhistorie
                </summary>

                ${
                  Array.isArray(item.deliveries)
                  && item.deliveries.length
                    ? `
                      <div class="payment-monitoring-history-list">

                        ${item.deliveries.map(
                          delivery => `
                            <div>
                              <strong>
                                ${esc(
                                  deliveryLabel(
                                    delivery.type
                                  )
                                )}
                              </strong>

                              <span>
                                ${esc(
                                  delivery.status === 'sent'
                                    ? 'Verzonden'
                                    : delivery.status === 'failed'
                                      ? 'Mislukt'
                                      : 'In verwerking'
                                )}
                              </span>

                              <small>
                                ${esc(
                                  dateTime(
                                    delivery.sentAt
                                    || delivery.createdAt
                                  )
                                )}
                              </small>

                              ${
                                delivery.lastError
                                  ? `
                                    <em>
                                      ${esc(
                                        delivery.lastError
                                      )}
                                    </em>
                                  `
                                  : ''
                              }
                            </div>
                          `
                        ).join('')}

                      </div>
                    `
                    : `
                      <p>
                        Nog geen verzendingen geregistreerd.
                      </p>
                    `
                }

              </details>

            </article>
          `
        ).join('')}

      </div>
    `;


    if (canCredit) {
      list
        .querySelectorAll(
          '[data-credit-invoice]'
        )
        .forEach(
          button => {
            const item =
              items.find(
                currentItem =>
                  currentItem.invoiceId ===
                  button.dataset.creditInvoice
              );

            if (!item) {
              button.disabled =
                true;

              return;
            }

            button.onclick =
              () => {
                openCreditDialog(
                  item
                );
              };
          }
        );
    }
  }

  async function load() {
    const active =
      ++version;

    status.textContent =
      'Betalingsbewaking laden...';

    refresh.disabled =
      true;

    try {
      const params =
        new URLSearchParams();

      if (organization.value) {
        params.set(
          'organizationId',
          organization.value
        );
      }

      params.set(
        'limit',
        '250'
      );

      const result =
        await api(
          '/api/payment-monitoring?'
          +params.toString()
        );

      if (
        active !== version
      ) {
        return;
      }

      current =
        result;

      status.textContent =
        '';

      render();

    } catch(error) {
      if (
        active !== version
      ) {
        return;
      }

      status.textContent =
        error.message
        || 'Betalingsbewaking kon niet worden geladen.';

      current =
        null;

      summary.innerHTML =
        '';

      list.innerHTML =
        '';

    } finally {
      if (
        active === version
      ) {
        refresh.disabled =
          false;
      }
    }
  }

  organization.onchange =
    () => {
      void load();
    };

  filter.onchange =
    render;

  search.oninput =
    render;

  refresh.onclick =
    () => {
      void load();
    };

  await load();
}
