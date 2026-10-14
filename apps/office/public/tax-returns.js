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


const taxLabels = {
  vat: 'BTW',
  icp: 'ICP',
  oss: 'OSS',
  payroll: 'Loonheffingen',
  corporate_tax: 'VPB',
  income_tax: 'IB',
  dividend_tax: 'Dividendbelasting',
};


const statusLabels = {
  draft: 'Concept',
  prepared: 'Voorbereid',
  ready: 'Gereed voor aangifte',
  submitted: 'Ingediend',
  accepted: 'Geaccepteerd',
  rejected: 'Afgekeurd',
  paid: 'Betaald',
  not_applicable: 'Niet van toepassing',
};


function dateLabel(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'nl-NL',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  ).format(
    new Date(
      `${value}T12:00:00`
    )
  );
}


export async function mountTaxReturns(
  root,
  api,
  clientData
) {
  let organizationId =
    '';

  let items =
    [];

  let busy =
    false;


  const organizations =
    clientData?.organizations ??
    [];


  root.innerHTML = `
    <section class="office-tax">

      <div class="office-tax-intro">
        <div>
          <p class="eyebrow">
            FISCAAL
          </p>

          <h2>
            Aangiften
          </h2>

          <p>
            Beheer aangifteperioden, deadlines en statussen.
            Wize gebruikt deze gegevens voor fiscale signalen.
          </p>
        </div>

        <button
          type="button"
          class="primary"
          data-new-period
          disabled
        >
          Nieuwe periode
        </button>
      </div>


      <section class="panel office-tax-filter">
        <label>
          Onderneming

          <select data-organization>
            <option value="">
              Kies een onderneming
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
      </section>


      <p
        class="office-tax-error"
        role="alert"
        data-error
      ></p>


      <section
        class="office-tax-overview"
        data-overview
      >
        <div class="panel empty">
          Kies een onderneming om de aangiften te bekijken.
        </div>
      </section>

    </section>
  `;


  const select =
    root.querySelector(
      '[data-organization]'
    );

  const overview =
    root.querySelector(
      '[data-overview]'
    );

  const errorBox =
    root.querySelector(
      '[data-error]'
    );

  const newButton =
    root.querySelector(
      '[data-new-period]'
    );


  function showError(
    message = ''
  ) {
    errorBox.textContent =
      message;
  }


  function render() {
    if (!organizationId) {
      overview.innerHTML = `
        <div class="panel empty">
          Kies een onderneming om de aangiften te bekijken.
        </div>
      `;

      return;
    }


    if (!items.length) {
      overview.innerHTML = `
        <section class="panel office-tax-empty">
          <strong>
            Nog geen aangifteperioden
          </strong>

          <p>
            Voeg de eerste BTW- of andere fiscale periode toe.
          </p>
        </section>
      `;

      return;
    }


    overview.innerHTML = `
      <div class="office-tax-grid">

        ${
          items.map(
            item => {

              const today =
                new Date();

              const due =
                item.dueDate
                  ? new Date(
                      `${item.dueDate}T23:59:59`
                    )
                  : null;

              const overdue =
                due
                && due < today
                && ![
                  'submitted',
                  'accepted',
                  'paid',
                  'not_applicable',
                ].includes(
                  item.status
                );


              return `
                <article
                  class="office-tax-card ${
                    overdue
                      ? 'overdue'
                      : ''
                  }"
                >

                  <div class="office-tax-card-head">

                    <div>
                      <span class="office-tax-type">
                        ${esc(
                          taxLabels[
                            item.taxType
                          ] ??
                          item.taxType
                        )}
                      </span>

                      <h3>
                        ${esc(
                          dateLabel(
                            item.periodStart
                          )
                        )}
                        —
                        ${esc(
                          dateLabel(
                            item.periodEnd
                          )
                        )}
                      </h3>
                    </div>

                    <span
                      class="office-tax-status status-${esc(
                        item.status
                      )}"
                    >
                      ${esc(
                        statusLabels[
                          item.status
                        ] ??
                        item.status
                      )}
                    </span>

                  </div>


                  <div class="office-tax-details">

                    <div>
                      <span>
                        Aangiftedeadline
                      </span>

                      <strong>
                        ${esc(
                          dateLabel(
                            item.dueDate
                          )
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Betaaldeadline
                      </span>

                      <strong>
                        ${esc(
                          dateLabel(
                            item.paymentDueDate
                          )
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Referentie
                      </span>

                      <strong>
                        ${esc(
                          item.reference ||
                          '—'
                        )}
                      </strong>
                    </div>

                  </div>


                  ${
                    overdue
                      ? `
                        <div class="office-tax-warning">
                          Deadline verstreken — Wize kan hiervoor een signaal geven.
                        </div>
                      `
                      : ''
                  }


                  <button
                    type="button"
                    data-edit-period="${esc(
                      item.id
                    )}"
                  >
                    Bewerken
                  </button>

                </article>
              `;
            }
          ).join('')
        }

      </div>
    `;


    overview
      .querySelectorAll(
        '[data-edit-period]'
      )
      .forEach(
        button => {

          const item =
            items.find(
              period =>
                period.id ===
                button.dataset
                  .editPeriod
            );

          if (item) {
            button.onclick =
              () =>
                openDialog(
                  item
                );
          }
        }
      );
  }


  async function load() {
    if (!organizationId) {
      items = [];
      render();
      return;
    }


    busy = true;
    showError('');

    overview.innerHTML = `
      <section class="panel">
        Aangiften ophalen...
      </section>
    `;


    try {
      const data =
        await api(
          `/api/tax-returns?organizationId=${encodeURIComponent(
            organizationId
          )}`
        );

      items =
        data.items ??
        [];

      render();
    } catch (error) {
      showError(
        error.message
      );

      items = [];
      render();
    } finally {
      busy = false;
    }
  }


  function openDialog(
    item = null
  ) {
    if (
      !organizationId
      || busy
    ) {
      return;
    }


    const dialog =
      document.createElement(
        'dialog'
      );

    dialog.className =
      'office-tax-dialog';


    dialog.innerHTML = `
      <form>

        <p class="eyebrow">
          AANGIFTEPERIODE
        </p>

        <h2>
          ${
            item
              ? 'Periode bewerken'
              : 'Nieuwe periode'
          }
        </h2>


        <div class="office-tax-form-grid">

          <label>
            Type aangifte

            <select
              name="taxType"
              required
            >
              ${
                Object.entries(
                  taxLabels
                )
                  .map(
                    ([value, label]) => `
                      <option
                        value="${esc(value)}"
                        ${
                          item?.taxType ===
                          value
                            ? 'selected'
                            : ''
                        }
                      >
                        ${esc(label)}
                      </option>
                    `
                  )
                  .join('')
              }
            </select>
          </label>


          <label>
            Status

            <select
              name="status"
              required
            >
              ${
                Object.entries(
                  statusLabels
                )
                  .map(
                    ([value, label]) => `
                      <option
                        value="${esc(value)}"
                        ${
                          (
                            item?.status ??
                            'draft'
                          ) ===
                          value
                            ? 'selected'
                            : ''
                        }
                      >
                        ${esc(label)}
                      </option>
                    `
                  )
                  .join('')
              }
            </select>
          </label>


          <label>
            Periode vanaf

            <input
              type="date"
              name="periodStart"
              value="${esc(
                item?.periodStart ??
                ''
              )}"
              required
            >
          </label>


          <label>
            Periode t/m

            <input
              type="date"
              name="periodEnd"
              value="${esc(
                item?.periodEnd ??
                ''
              )}"
              required
            >
          </label>


          <label>
            Aangiftedeadline

            <input
              type="date"
              name="dueDate"
              value="${esc(
                item?.dueDate ??
                ''
              )}"
              required
            >
          </label>


          <label>
            Betaaldeadline

            <input
              type="date"
              name="paymentDueDate"
              value="${esc(
                item?.paymentDueDate ??
                ''
              )}"
            >
          </label>

        </div>


        <label>
          Referentie

          <input
            type="text"
            name="reference"
            maxlength="200"
            value="${esc(
              item?.reference ??
              ''
            )}"
            placeholder="Bijvoorbeeld kenmerk Belastingdienst"
          >
        </label>


        <p
          class="office-tax-dialog-error"
          role="alert"
        ></p>


        <div class="customer-buttons">

          <button
            type="submit"
            class="primary"
          >
            Opslaan
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


    dialog
      .querySelector(
        '[data-cancel]'
      )
      .onclick =
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

        const submit =
          form.querySelector(
            '[type="submit"]'
          );

        submit.disabled =
          true;

        const errorTarget =
          dialog.querySelector(
            '.office-tax-dialog-error'
          );

        errorTarget.textContent =
          '';


        try {
          const values =
            Object.fromEntries(
              new FormData(
                form
              )
            );


          await api(
            '/api/tax-returns',
            {
              action:
                'upsertPeriod',

              organizationId,

              taxType:
                values.taxType,

              status:
                values.status,

              periodStart:
                values.periodStart,

              periodEnd:
                values.periodEnd,

              dueDate:
                values.dueDate,

              paymentDueDate:
                values.paymentDueDate,

              reference:
                values.reference,
            }
          );


          dialog.close();

          await load();

        } catch (error) {
          errorTarget.textContent =
            error.message;
        } finally {
          busy = false;

          submit.disabled =
            false;
        }
      };


    dialog.showModal();
  }


  select.onchange =
    async () => {

      organizationId =
        select.value;

      newButton.disabled =
        !organizationId;

      await load();
    };


  newButton.onclick =
    () =>
      openDialog();

}
