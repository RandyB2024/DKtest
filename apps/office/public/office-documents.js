const escapeHtml =
  value =>
    String(
      value ?? '',
    ).replace(
      /[&<>"']/g,
      character => ({
        '&':
          '&amp;',
        '<':
          '&lt;',
        '>':
          '&gt;',
        '"':
          '&quot;',
        "'":
          '&#39;',
      })[
        character
      ],
    );

const dateTime =
  new Intl.DateTimeFormat(
    'nl-NL',
    {
      day:
        '2-digit',
      month:
        '2-digit',
      year:
        'numeric',
      hour:
        '2-digit',
      minute:
        '2-digit',
    },
  );

const bytes =
  new Intl.NumberFormat(
    'nl-NL',
    {
      maximumFractionDigits:
        1,
    },
  );

function fileSize(
  value,
) {
  const size =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      size,
    )
  ) {
    return '—';
  }

  if (
    size <
      1024
  ) {
    return `${size} B`;
  }

  if (
    size <
      1024 * 1024
  ) {
    return `${bytes.format(
      size /
        1024,
    )} KB`;
  }

  return `${bytes.format(
    size /
      1024 /
      1024,
  )} MB`;
}

function sourceLabel(
  source,
) {
  if (
    source ===
      'customer'
  ) {
    return 'Van klant';
  }

  if (
    source ===
      'office'
  ) {
    return 'Naar klant';
  }

  if (
    source ===
      'email'
  ) {
    return 'E-mail';
  }

  return 'Systeem';
}

function statusLabel(
  status,
) {
  return ({
    new:
      'Nieuw',
    in_review:
      'In behandeling',
    needs_customer_action:
      'Actie klant nodig',
    ready:
      'Klaar',
    processed:
      'Verwerkt',
    archived:
      'Gearchiveerd',
  })[
    status
  ] ??
    status;
}

function readState(
  document,
) {
  if (
    document.source !==
      'office'
  ) {
    return {
      className:
        'neutral',
      title:
        'Niet van toepassing',
      detail:
        'Document ontvangen van klant',
    };
  }

  if (
    document.receipt
      ?.acknowledgedCount >
    0
  ) {
    return {
      className:
        'confirmed',
      title:
        'Gelezen bevestigd',
      detail:
        document.receipt
          .lastAcknowledgedAt
          ? dateTime.format(
              new Date(
                document.receipt
                  .lastAcknowledgedAt,
              ),
            )
          : 'Bevestigd',
    };
  }

  if (
    document.receipt
      ?.openedCount >
    0
  ) {
    return {
      className:
        'opened',
      title:
        'Geopend',
      detail:
        'Nog niet als gelezen bevestigd',
    };
  }

  return {
    className:
      document
        .acknowledgement_required
        ? 'waiting'
        : 'neutral',
    title:
      'Niet geopend',
    detail:
      document
        .acknowledgement_required
        ? 'Leesbevestiging gevraagd'
        : 'Geen bevestiging vereist',
  };
}

async function apiForm(
  path,
  form,
) {
  const response =
    await fetch(
      path,
      {
        method:
          'POST',
        credentials:
          'same-origin',
        cache:
          'no-store',
        signal:
          AbortSignal.timeout(
            90000,
          ),
        body:
          form,
      },
    );

  const result =
    await response.json();

  if (
    !response.ok ||
    !result.ok
  ) {
    throw Object.assign(
      new Error(
        result.error
          ?.message ||
          'Document kon niet worden opgeslagen.',
      ),
      {
        status:
          response.status,
        code:
          result.error
            ?.code,
      },
    );
  }

  return result.data;
}

export function mountOfficeDocuments(
  root,
  api,
  sourceData,
) {
  const relationships =
    sourceData
      ?.relationships ??
    [];

  const organizations =
    (
      sourceData
        ?.organizations ??
      []
    ).filter(
      organization =>
        !organization
          .archived_at,
    );

  const relationshipById =
    new Map(
      relationships.map(
        relationship => [
          relationship.id,
          relationship,
        ],
      ),
    );

  const state = {
    organizationId:
      organizations[0]
        ?.id ??
      '',
    documents:
      [],
    selectedId:
      null,
    loading:
      false,
    uploading:
      false,
    search:
      '',
    source:
      '',
    status:
      '',
  };

  root.className =
    'office-documents';

  root.innerHTML = `
    <section class="office-documents-head">
      <div>
        <p class="eyebrow">Documentenstroom</p>
        <h2>Documenten per administratie</h2>
        <p>Ontvang bestanden van klanten, stuur documenten terug en volg de leesbevestiging.</p>
      </div>

      <button type="button" class="primary" id="office-document-upload">
        Document naar klant
      </button>
    </section>

    <section class="office-documents-toolbar panel">
      <label>
        <span>Administratie</span>
        <select id="office-document-organization"></select>
      </label>

      <label>
        <span>Zoeken</span>
        <input id="office-document-search" type="search" placeholder="Bestandsnaam">
      </label>

      <label>
        <span>Herkomst</span>
        <select id="office-document-source">
          <option value="">Alles</option>
          <option value="customer">Van klant</option>
          <option value="office">Naar klant</option>
        </select>
      </label>

      <label>
        <span>Status</span>
        <select id="office-document-status">
          <option value="">Alle statussen</option>
          <option value="new">Nieuw</option>
          <option value="in_review">In behandeling</option>
          <option value="needs_customer_action">Actie klant nodig</option>
          <option value="ready">Klaar</option>
          <option value="processed">Verwerkt</option>
        </select>
      </label>
    </section>

    <p class="office-documents-message" id="office-documents-message" role="status"></p>

    <section class="office-documents-layout">
      <article class="panel office-documents-list">
        <div class="office-documents-list-head">
          <div>
            <p class="eyebrow">Inbox en verwerking</p>
            <h3 id="office-documents-count">Documenten</h3>
          </div>
        </div>

        <div id="office-documents-table"></div>
      </article>

      <aside class="panel office-document-detail" id="office-document-detail">
        <div class="office-document-empty">
          <strong>Selecteer een document</strong>
          <span>Hier ziet u de bron, verwerking en leesstatus.</span>
        </div>
      </aside>
    </section>

    <dialog class="office-document-dialog" id="office-document-dialog">
      <form id="office-document-form">
        <div class="office-document-dialog-head">
          <div>
            <p class="eyebrow">Naar klant</p>
            <h2>Document uploaden</h2>
          </div>
          <button type="button" class="office-document-close" data-close aria-label="Sluiten">×</button>
        </div>

        <fieldset>
          <label>
            <span>Administratie</span>
            <select name="organizationId" required></select>
          </label>

          <label>
            <span>Bestand</span>
            <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required>
            <small>PDF, JPG of PNG · maximaal 50 MB</small>
          </label>

          <label class="office-document-check">
            <input name="acknowledgementRequired" type="checkbox" value="true">
            <span>
              <strong>Leesbevestiging vragen</strong>
              <small>De klant kan expliciet bevestigen dat het document is gelezen.</small>
            </span>
          </label>
        </fieldset>

        <p class="office-document-dialog-error" role="alert"></p>

        <div class="office-document-dialog-actions">
          <button type="button" data-close>Annuleren</button>
          <button type="submit" class="primary">Uploaden naar klant</button>
        </div>
      </form>
    </dialog>
  `;

  const organizationSelect =
    root.querySelector(
      '#office-document-organization',
    );

  const uploadOrganizationSelect =
    root.querySelector(
      '[name="organizationId"]',
    );

  const message =
    root.querySelector(
      '#office-documents-message',
    );

  const table =
    root.querySelector(
      '#office-documents-table',
    );

  const detail =
    root.querySelector(
      '#office-document-detail',
    );

  const count =
    root.querySelector(
      '#office-documents-count',
    );

  const dialog =
    root.querySelector(
      '#office-document-dialog',
    );

  const form =
    root.querySelector(
      '#office-document-form',
    );

  function organizationLabel(
    organization,
  ) {
    const relationship =
      relationshipById.get(
        organization
          .customer_relationship_id,
      );

    const customer =
      relationship?.name &&
      relationship.name !==
        organization.name
        ? `${relationship.name} · `
        : '';

    return `${customer}${
      organization.legal_name ||
      organization.name
    }`;
  }

  for (
    const organization
    of organizations
  ) {
    for (
      const control
      of [
        organizationSelect,
        uploadOrganizationSelect,
      ]
    ) {
      const option =
        document.createElement(
          'option',
        );

      option.value =
        organization.id;

      option.textContent =
        organizationLabel(
          organization,
        );

      control.append(
        option,
      );
    }
  }

  function setMessage(
    value,
    isError =
      false,
  ) {
    message.textContent =
      value;

    message.classList.toggle(
      'error',
      isError,
    );
  }

  function selectedDocument() {
    return state.documents.find(
      document =>
        document.id ===
        state.selectedId,
    );
  }

  function filteredDocuments() {
    const query =
      state.search
        .trim()
        .toLocaleLowerCase(
          'nl',
        );

    return state.documents.filter(
      document =>
        (
          !query ||
          document.filename
            .toLocaleLowerCase(
              'nl',
            )
            .includes(
              query,
            )
        ) &&
        (
          !state.source ||
          document.source ===
            state.source
        ) &&
        (
          !state.status ||
          document.status ===
            state.status
        ),
    );
  }

  function renderTable() {
    const documents =
      filteredDocuments();

    count.textContent =
      `${documents.length} document${
        documents.length ===
        1
          ? ''
          : 'en'
      }`;

    if (
      state.loading
    ) {
      table.innerHTML =
        '<div class="office-document-empty"><strong>Documenten laden…</strong></div>';

      return;
    }

    if (
      !documents.length
    ) {
      table.innerHTML =
        '<div class="office-document-empty"><strong>Geen documenten gevonden</strong><span>Pas de filters aan of upload een document naar de klant.</span></div>';

      return;
    }

    table.innerHTML = `
      <div class="office-document-table">
        <div class="office-document-row office-document-row--head">
          <span>Document</span>
          <span>Herkomst</span>
          <span>Status</span>
          <span>Leesstatus</span>
          <span>Datum</span>
        </div>

        ${documents.map(document => {
          const read =
            readState(
              document,
            );

          return `
            <button
              type="button"
              class="office-document-row ${document.id === state.selectedId ? 'selected' : ''}"
              data-document-id="${escapeHtml(document.id)}"
            >
              <span class="office-document-name">
                <strong>${escapeHtml(document.filename)}</strong>
                <small>${escapeHtml(fileSize(document.size_bytes))}</small>
              </span>

              <span>
                <i class="office-document-source ${escapeHtml(document.source)}">${escapeHtml(sourceLabel(document.source))}</i>
              </span>

              <span>
                <i class="office-document-status">${escapeHtml(statusLabel(document.status))}</i>
              </span>

              <span>
                <i class="office-document-read ${escapeHtml(read.className)}">${escapeHtml(read.title)}</i>
              </span>

              <span class="office-document-date">
                ${escapeHtml(dateTime.format(new Date(document.created_at)))}
              </span>
            </button>
          `;
        }).join('')}
      </div>
    `;

    table
      .querySelectorAll(
        '[data-document-id]',
      )
      .forEach(
        button => {
          button.onclick =
            () => {
              state.selectedId =
                button.dataset
                  .documentId;

              renderTable();
              renderDetail();
            };
        },
      );
  }

  function renderDetail() {
    const document =
      selectedDocument();

    if (
      !document
    ) {
      detail.innerHTML = `
        <div class="office-document-empty">
          <strong>Selecteer een document</strong>
          <span>Hier ziet u de bron, verwerking en leesstatus.</span>
        </div>
      `;

      return;
    }

    const read =
      readState(
        document,
      );

    detail.innerHTML = `
      <div class="office-document-detail-head">
        <div>
          <p class="eyebrow">${escapeHtml(sourceLabel(document.source))}</p>
          <h3>${escapeHtml(document.filename)}</h3>
          <p>${escapeHtml(fileSize(document.size_bytes))} · ${escapeHtml(dateTime.format(new Date(document.created_at)))}</p>
        </div>
      </div>

      <dl class="office-document-meta">
        <div>
          <dt>Verwerking</dt>
          <dd>${escapeHtml(statusLabel(document.status))}</dd>
        </div>

        <div>
          <dt>Leesstatus klant</dt>
          <dd>
            <span class="office-document-read ${escapeHtml(read.className)}">${escapeHtml(read.title)}</span>
            <small>${escapeHtml(read.detail)}</small>
          </dd>
        </div>

        <div>
          <dt>Leesbevestiging vereist</dt>
          <dd>${document.source === 'office' ? (document.acknowledgement_required ? 'Ja' : 'Nee') : 'Niet van toepassing'}</dd>
        </div>

        <div>
          <dt>Type</dt>
          <dd>${escapeHtml(document.mime_type)}</dd>
        </div>
      </dl>

      <button type="button" class="office-document-open" id="office-document-open">
        Document openen
      </button>

      <div class="office-document-processing">
        <label>
          <span>Verwerkingsstatus</span>
          <select id="office-document-set-status">
            <option value="new" ${document.status === 'new' ? 'selected' : ''}>Nieuw</option>
            <option value="in_review" ${document.status === 'in_review' ? 'selected' : ''}>In behandeling</option>
            <option value="needs_customer_action" ${document.status === 'needs_customer_action' ? 'selected' : ''}>Actie klant nodig</option>
            <option value="ready" ${document.status === 'ready' ? 'selected' : ''}>Klaar</option>
            <option value="processed" ${document.status === 'processed' ? 'selected' : ''}>Verwerkt</option>
          </select>
        </label>

        <button type="button" id="office-document-save-status">
          Status opslaan
        </button>
      </div>

      ${document.source === 'office' ? `
        <label class="office-document-check office-document-check--detail">
          <input id="office-document-ack-required" type="checkbox" ${document.acknowledgement_required ? 'checked' : ''}>
          <span>
            <strong>Leesbevestiging vereist</strong>
            <small>De klant krijgt de mogelijkheid expliciet te bevestigen dat het document is gelezen.</small>
          </span>
        </label>
      ` : ''}

      <div class="office-document-archive-note">
        <strong>Archiveren</strong>
        <span>Archivering per boekjaar, maand en map volgt in de volgende stap. Tot die tijd blijft een verwerkt document zichtbaar.</span>
      </div>
    `;

    detail.querySelector(
      '#office-document-open',
    ).onclick =
      async event => {
        const button =
          event.currentTarget;

        button.disabled =
          true;

        setMessage(
          '',
        );

        try {
          const result =
            await api(
              `/api/documents/${encodeURIComponent(
                document.id,
              )}/download?organizationId=${encodeURIComponent(
                state.organizationId,
              )}`,
            );

          window.open(
            result.url,
            '_blank',
            'noopener,noreferrer',
          );
        } catch (
          error
        ) {
          setMessage(
            error.message,
            true,
          );
        } finally {
          button.disabled =
            false;
        }
      };

    detail.querySelector(
      '#office-document-save-status',
    ).onclick =
      async event => {
        const button =
          event.currentTarget;

        button.disabled =
          true;

        setMessage(
          '',
        );

        try {
          const status =
            detail.querySelector(
              '#office-document-set-status',
            ).value;

          const body = {
            organizationId:
              state.organizationId,
            status,
          };

          const acknowledgement =
            detail.querySelector(
              '#office-document-ack-required',
            );

          if (
            acknowledgement
          ) {
            body.acknowledgementRequired =
              acknowledgement.checked;
          }

          await api(
            `/api/documents/${encodeURIComponent(
              document.id,
            )}`,
            body,
            'PATCH',
          );

          setMessage(
            'Documentstatus bijgewerkt.',
          );

          await loadDocuments(
            document.id,
          );
        } catch (
          error
        ) {
          setMessage(
            error.message,
            true,
          );
        } finally {
          button.disabled =
            false;
        }
      };
  }

  async function loadDocuments(
    keepSelectedId =
      null,
  ) {
    if (
      !state.organizationId
    ) {
      state.documents =
        [];
      state.selectedId =
        null;
      renderTable();
      renderDetail();
      return;
    }

    state.loading =
      true;

    setMessage(
      '',
    );

    renderTable();

    try {
      const result =
        await api(
          `/api/documents?organizationId=${encodeURIComponent(
            state.organizationId,
          )}`,
        );

      state.documents =
        result.documents ??
        [];

      if (
        keepSelectedId &&
        state.documents.some(
          document =>
            document.id ===
            keepSelectedId,
        )
      ) {
        state.selectedId =
          keepSelectedId;
      } else if (
        !state.documents.some(
          document =>
            document.id ===
            state.selectedId,
        )
      ) {
        state.selectedId =
          state.documents[0]
            ?.id ??
          null;
      }
    } catch (
      error
    ) {
      state.documents =
        [];
      state.selectedId =
        null;

      setMessage(
        error.message,
        true,
      );
    } finally {
      state.loading =
        false;

      renderTable();
      renderDetail();
    }
  }

  organizationSelect.value =
    state.organizationId;

  uploadOrganizationSelect.value =
    state.organizationId;

  organizationSelect.onchange =
    () => {
      state.organizationId =
        organizationSelect.value;

      uploadOrganizationSelect.value =
        state.organizationId;

      state.selectedId =
        null;

      void loadDocuments();
    };

  root.querySelector(
    '#office-document-search',
  ).oninput =
    event => {
      state.search =
        event.target.value;

      renderTable();
    };

  root.querySelector(
    '#office-document-source',
  ).onchange =
    event => {
      state.source =
        event.target.value;

      renderTable();
    };

  root.querySelector(
    '#office-document-status',
  ).onchange =
    event => {
      state.status =
        event.target.value;

      renderTable();
    };

  root.querySelector(
    '#office-document-upload',
  ).onclick =
    () => {
      uploadOrganizationSelect.value =
        state.organizationId;

      dialog.showModal();
    };

  dialog
    .querySelectorAll(
      '[data-close]',
    )
    .forEach(
      button => {
        button.onclick =
          () =>
            dialog.close();
      },
    );

  form.onsubmit =
    async event => {
      event.preventDefault();

      if (
        state.uploading
      ) {
        return;
      }

      const errorBox =
        dialog.querySelector(
          '.office-document-dialog-error',
        );

      const submit =
        form.querySelector(
          '[type="submit"]',
        );

      errorBox.textContent =
        '';

      state.uploading =
        true;

      submit.disabled =
        true;

      submit.textContent =
        'Uploaden…';

      try {
        const formData =
          new FormData(
            form,
          );

        formData.set(
          'acknowledgementRequired',
          form.elements
            .acknowledgementRequired
            .checked
            ? 'true'
            : 'false',
        );

        const result =
          await apiForm(
            '/api/documents',
            formData,
          );

        state.organizationId =
          form.elements
            .organizationId
            .value;

        organizationSelect.value =
          state.organizationId;

        dialog.close();
        form.reset();

        setMessage(
          'Document is veilig naar de klant geüpload.',
        );

        await loadDocuments(
          result.document
            .id,
        );
      } catch (
        error
      ) {
        errorBox.textContent =
          error.message;
      } finally {
        state.uploading =
          false;

        submit.disabled =
          false;

        submit.textContent =
          'Uploaden naar klant';
      }
    };

  if (
    !organizations.length
  ) {
    root.querySelector(
      '#office-document-upload',
    ).disabled =
      true;

    setMessage(
      'Er zijn nog geen actieve ondernemingen beschikbaar.',
      true,
    );
  }

  void loadDocuments();
}
