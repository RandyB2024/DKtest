const escapeHtml = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character])
  );

const formatDate = value => {
  if (!value) return '?';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '?';

  return new Intl.DateTimeFormat(
    'nl-NL',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
};

const formatSize = bytes => {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size < 0) return '?';

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} kB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const sourceLabel = source => ({
  customer: 'Klant',
  office: 'Office',
  email: 'E-mail',
  system: 'Systeem',
}[source] ?? source ?? 'Onbekend');

const statusLabel = status => ({
  new: 'Nieuw',
  in_review: 'In behandeling',
  needs_customer_action: 'Actie klant',
  ready: 'Gereed',
  processed: 'Verwerkt',
  archived: 'Gearchiveerd',
}[status] ?? status ?? 'Onbekend');

export function mountOfficeDocumentsReadonly(root, api, clientData) {
  if (!root) return;

  const organizations =
    [...(clientData?.organizations ?? [])]
      .sort((a, b) =>
        String(a.name ?? '').localeCompare(
          String(b.name ?? ''),
          'nl'
        )
      );

  root.innerHTML = `
    <section class="panel office-documents-readonly">
      <div class="office-documents-header">
        <div>
          <p class="eyebrow">Destination Known Office</p>
          <h2>Documenten</h2>
          <p class="small-copy">
            Read-only dossierweergave. Uploaden, wijzigen en archiveren
            worden in volgende stappen toegevoegd.
          </p>
        </div>

        <button type="button" id="documents-refresh">
          Vernieuwen
        </button>
      </div>

      <label class="office-documents-organization">
        Onderneming
        <select id="documents-organization">
          ${
            organizations.length
              ? organizations.map(organization =>
                  `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`
                ).join('')
              : '<option value="">Geen ondernemingen beschikbaar</option>'
          }
        </select>
      </label>

      <p id="documents-status" class="small-copy" role="status"></p>

      <div id="documents-list"></div>
    </section>
  `;

  const select =
    root.querySelector('#documents-organization');

  const status =
    root.querySelector('#documents-status');

  const list =
    root.querySelector('#documents-list');

  const refresh =
    root.querySelector('#documents-refresh');

  let requestVersion = 0;

  async function openDocument(documentId) {
    const organizationId = select.value;

    if (!organizationId) return;

    const result = await api(
      `/api/documents/${encodeURIComponent(documentId)}/download?organizationId=${encodeURIComponent(organizationId)}`
    );

    const opened =
      window.open(
        result.url,
        '_blank',
        'noopener,noreferrer'
      );

    if (!opened) {
      window.location.assign(result.url);
    }
  }

  function renderDocuments(documents) {
    if (!documents.length) {
      list.innerHTML = `
        <div class="office-documents-empty">
          <strong>Geen documenten gevonden</strong>
          <span>Er staan nog geen actieve documenten bij deze onderneming.</span>
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <div class="office-documents-table">
        <div class="office-documents-row office-documents-row--head">
          <span>Document</span>
          <span>Bron</span>
          <span>Status</span>
          <span>Datum</span>
          <span></span>
        </div>

        ${documents.map(document => `
          <div class="office-documents-row">
            <div>
              <strong>${escapeHtml(document.filename)}</strong>
              <small>${escapeHtml(formatSize(document.size_bytes))}</small>
            </div>

            <span>${escapeHtml(sourceLabel(document.source))}</span>

            <span>
              <em>${escapeHtml(statusLabel(document.status))}</em>
            </span>

            <span>${escapeHtml(formatDate(document.created_at))}</span>

            <button
              type="button"
              data-open-document="${escapeHtml(document.id)}"
            >
              Openen
            </button>
          </div>
        `).join('')}
      </div>
    `;

    list.querySelectorAll('[data-open-document]')
      .forEach(button => {
        button.addEventListener('click', async () => {
          button.disabled = true;
          status.textContent = 'Document veilig openen?';

          try {
            await openDocument(
              button.dataset.openDocument
            );

            status.textContent = '';
          } catch (error) {
            status.textContent =
              error.message ||
              'Het document kon niet worden geopend.';
          } finally {
            button.disabled = false;
          }
        });
      });
  }

  async function load() {
    const organizationId = select.value;
    const version = ++requestVersion;

    if (!organizationId) {
      status.textContent =
        'Er is geen onderneming beschikbaar.';
      list.replaceChildren();
      return;
    }

    status.textContent =
      'Documenten veilig ophalen?';

    list.innerHTML = `
      <div class="office-documents-empty">
        <span>Laden?</span>
      </div>
    `;

    try {
      const result = await api(
        `/api/documents?organizationId=${encodeURIComponent(organizationId)}`
      );

      if (version !== requestVersion) return;

      const documents =
        Array.isArray(result.documents)
          ? result.documents
          : [];

      status.textContent =
        `${documents.length} ${
          documents.length === 1
            ? 'document'
            : 'documenten'
        }`;

      renderDocuments(documents);
    } catch (error) {
      if (version !== requestVersion) return;

      status.textContent =
        error.message ||
        'Documenten konden niet worden opgehaald.';

      list.replaceChildren();
    }
  }

  select.addEventListener(
    'change',
    () => void load()
  );

  refresh.addEventListener(
    'click',
    () => void load()
  );

  void load();
}
