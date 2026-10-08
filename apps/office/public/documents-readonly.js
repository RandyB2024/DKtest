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

const typeLabel = type => ({
  purchase_invoice: 'Inkoopfactuur',
  sales_invoice: 'Verkoopfactuur',
  bank_document: 'Bankdocument',
  tax_document: 'Belastingdocument',
  payroll: 'Loonadministratie',
  contract: 'Contract',
  other: 'Overig',
}[type] ?? 'Overig');

const formatDate = value => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

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

  if (!Number.isFinite(size) || size < 0) return '-';

  if (size < 1024) return `${size} B`;

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} kB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const monthNames = [
  'Januari',
  'Februari',
  'Maart',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Augustus',
  'September',
  'Oktober',
  'November',
  'December',
];

const archiveFolderLabel = document =>
  document.archive_folder_name
  || typeLabel(document.document_type);

const businessDossierFolders =
  new Set([
    'Contracten & overeenkomsten',
    'Contracten',
    'KvK & bedrijfsgegevens',
    'Verzekeringen',
    'Financieringen & leningen',
    'Lease & voertuigen',
    'Personeel',
    'Correspondentie',
  ]);

const annualFolders =
  new Set([
    'Jaarrekening & rapportages',
    'Aangiften',
    'Investeringen & activa',
  ]);

const archiveSection = folder => {
  if (
    businessDossierFolders.has(
      folder
    )
  ) {
    return 'business';
  }

  if (
    annualFolders.has(
      folder
    )
  ) {
    return 'annual';
  }

  return 'monthly';
};


const archiveDateParts = document => {
  const fallback =
    new Date(
      document.processed_at
      || document.archived_at
      || document.created_at
    );

  const fallbackYear =
    Number.isNaN(fallback.getTime())
      ? new Date().getFullYear()
      : fallback.getFullYear();

  const fallbackMonth =
    Number.isNaN(fallback.getTime())
      ? 1
      : fallback.getMonth() + 1;

  return {
    year:
      Number(document.book_year)
      || fallbackYear,

    month:
      Number(document.book_month)
      || fallbackMonth,
  };
};

export function mountOfficeDocumentsReadonly(
  root,
  api,
  clientData
) {
  if (!root) return;

  const organizations =
    [...(clientData?.organizations ?? [])]
      .sort((a, b) =>
        String(a.name ?? '').localeCompare(
          String(b.name ?? ''),
          'nl'
        )
      );

  const organizationMap =
    new Map(
      organizations.map(
        organization => [
          organization.id,
          organization.name,
        ]
      )
    );

  root.innerHTML = `
    <section class="panel office-documents-upload">
      <div class="office-documents-header">
        <div>
          <p class="eyebrow">Office ? klant</p>
          <h2>Document delen</h2>
          <p class="small-copy">
            Upload veilig een document naar het dossier van een klant.
          </p>
        </div>

        <button
          type="button"
          id="documents-upload-open"
        >
          Document uploaden
        </button>
      </div>

      <p
        id="documents-upload-status"
        class="small-copy"
        role="status"
      ></p>
    </section>

    <section class="panel office-documents-readonly">
      <div class="office-documents-header">
        <div>
          <p class="eyebrow">Destination Known Office</p>
          <h2>Inbox van klanten</h2>
          <p class="small-copy">
            Nieuwe documenten die nog door Office moeten worden beoordeeld.
          </p>
        </div>

        <span
          id="documents-inbox-count"
          class="documents-count"
        >
          -
        </span>
      </div>

      <div id="documents-inbox"></div>
    </section>

    <section class="panel office-documents-readonly">
      <div class="office-documents-header">
        <div>
          <p class="eyebrow">Documentdossier</p>
          <h2>Documenten per onderneming</h2>
          <p class="small-copy">
            Bekijk de actuele documenten en verwerkingsstatus.
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
              ? organizations.map(
                  organization =>
                    `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`
                ).join('')
              : '<option value="">Geen ondernemingen beschikbaar</option>'
          }
        </select>
      </label>

      <p
        id="documents-status"
        class="small-copy"
        role="status"
      ></p>

      <div id="documents-list"></div>
    </section>

    <section class="panel office-documents-archive">
      <div class="office-documents-header">
        <div>
          <p class="eyebrow">Documentarchief</p>
          <h2>Archief</h2>
          <p class="small-copy">
            Bekijk verwerkte documenten per jaar, maand en map.
          </p>
        </div>
      </div>

      <div id="documents-archive"></div>
    </section>
  `;

  const select =
    root.querySelector('#documents-organization');

  const status =
    root.querySelector('#documents-status');

  const list =
    root.querySelector('#documents-list');

  const archive =
    root.querySelector('#documents-archive');

  const inbox =
    root.querySelector('#documents-inbox');

  const count =
    root.querySelector('#documents-inbox-count');

  const refresh =
    root.querySelector('#documents-refresh');

  const uploadOpen =
    root.querySelector('#documents-upload-open');

  const uploadStatus =
    root.querySelector('#documents-upload-status');

  let requestVersion = 0;

  let archiveDocuments = [];

  let archiveState = {
    section: null,
    year: null,
    month: null,
    folder: null,
  };

  function uploadDialog() {
    if (!organizations.length) {
      uploadStatus.textContent =
        'Er is geen onderneming beschikbaar.';
      return;
    }

    const dialog =
      window.document.createElement('dialog');

    dialog.className =
      'customer-dialog documents-upload-dialog';

    dialog.innerHTML = `
      <form>
        <p class="eyebrow">Office ? klant</p>
        <h2>Document uploaden</h2>

        <fieldset>
          <label>
            Onderneming
            <select
              name="organizationId"
              required
            >
              ${organizations.map(
                organization =>
                  `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`
              ).join('')}
            </select>
          </label>

          <label>
            Bestand
            <input
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              required
            >
          </label>

          <p class="small-copy">
            Toegestaan: PDF, PNG en JPG. Maximaal 50 MB.
          </p>

          <label>
            Documenttype
            <select
              name="documentType"
              required
            >
              <option value="other">
                Overig
              </option>
              <option value="tax_document">
                Belastingdocument
              </option>
              <option value="contract">
                Contract
              </option>
              <option value="bank_document">
                Bankdocument
              </option>
              <option value="purchase_invoice">
                Inkoopfactuur
              </option>
              <option value="sales_invoice">
                Verkoopfactuur
              </option>
              <option value="payroll">
                Loonadministratie
              </option>
            </select>
          </label>

          <label>
            Boekjaar
            <input
              name="bookYear"
              type="number"
              min="2000"
              max="2100"
              value="${new Date().getFullYear()}"
              required
            >
          </label>

          <label>
            Maand
            <select
              name="bookMonth"
              required
            >
              ${[
                'Januari',
                'Februari',
                'Maart',
                'April',
                'Mei',
                'Juni',
                'Juli',
                'Augustus',
                'September',
                'Oktober',
                'November',
                'December',
              ].map(
                (label, index) =>
                  `<option value="${index + 1}" ${
                    new Date().getMonth() === index
                      ? 'selected'
                      : ''
                  }>${label}</option>`
              ).join('')}
            </select>
          </label>

          <label class="documents-check">
            <input
              name="visibleToCustomer"
              type="checkbox"
              checked
            >
            <span>
              Zichtbaar maken voor klant
            </span>
          </label>

          <label class="documents-check">
            <input
              name="acknowledgementRequired"
              type="checkbox"
            >
            <span>
              Leesbevestiging verplicht
            </span>
          </label>
        </fieldset>

        <p
          class="mutation-error"
          role="alert"
        ></p>

        <div class="customer-buttons">
          <button
            type="submit"
            class="primary"
          >
            Uploaden
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

    root.append(dialog);

    const form =
      dialog.querySelector('form');

    const visible =
      form.elements.visibleToCustomer;

    const acknowledgement =
      form.elements.acknowledgementRequired;

    const syncAcknowledgement = () => {
      acknowledgement.disabled =
        !visible.checked;

      if (!visible.checked) {
        acknowledgement.checked =
          false;
      }
    };

    visible.addEventListener(
      'change',
      syncAcknowledgement
    );

    syncAcknowledgement();

    dialog
      .querySelector('[data-cancel]')
      .onclick =
        () => dialog.close();

    dialog.addEventListener(
      'close',
      () => dialog.remove()
    );

    form.onsubmit = async event => {
      event.preventDefault();

      const submit =
        form.querySelector(
          '[type=submit]'
        );

      const errorBox =
        form.querySelector(
          '.mutation-error'
        );

      const file =
        form.elements.file.files?.[0];

      if (!file) {
        errorBox.textContent =
          'Kies eerst een document.';
        return;
      }

      const allowed =
        new Set([
          'application/pdf',
          'image/png',
          'image/jpeg',
        ]);

      if (!allowed.has(file.type)) {
        errorBox.textContent =
          'Alleen PDF, PNG en JPG zijn toegestaan.';
        return;
      }

      if (
        file.size <= 0
        || file.size > 52428800
      ) {
        errorBox.textContent =
          'Een document mag maximaal 50 MB zijn.';
        return;
      }

      const payload = {
        organizationId:
          form.elements.organizationId.value,
        filename:
          file.name,
        mimeType:
          file.type,
        sizeBytes:
          file.size,
        documentType:
          form.elements.documentType.value,
        bookYear:
          Number(form.elements.bookYear.value),
        bookMonth:
          Number(form.elements.bookMonth.value),
        visibleToCustomer:
          visible.checked,
        acknowledgementRequired:
          acknowledgement.checked,
      };

      submit.disabled = true;
      errorBox.textContent = '';

      try {
        uploadStatus.textContent =
          'Beveiligde upload voorbereiden...';

        const ticket =
          await api(
            '/api/documents/upload-ticket',
            payload
          );

        uploadStatus.textContent =
          'Bestand uploaden...';

        if (
          !ticket.signedUrl
          || !ticket.token
        ) {
          throw new Error(
            'De beveiligde uploadgegevens zijn onvolledig.'
          );
        }

        const uploadUrl =
          new URL(ticket.signedUrl);

        if (
          !uploadUrl.searchParams.has('token')
        ) {
          uploadUrl.searchParams.set(
            'token',
            ticket.token
          );
        }

        const uploadBody =
          new FormData();

        uploadBody.append(
          'cacheControl',
          '3600'
        );

        uploadBody.append(
          '',
          file
        );

        const uploadResponse =
          await fetch(
            uploadUrl.toString(),
            {
              method: 'PUT',
              headers: {
                'x-upsert':
                  'false',
              },
              body:
                uploadBody,
            }
          );

        if (!uploadResponse.ok) {
          let detail = '';

          try {
            detail =
              await uploadResponse.text();
          } catch {}

          throw new Error(
            detail
              ? `Upload mislukt: ${detail}`
              : 'Het bestand kon niet naar de beveiligde opslag worden verzonden.'
          );
        }

        uploadStatus.textContent =
          'Document registreren...';

        await api(
          '/api/documents/upload-complete',
          {
            ...payload,
            documentId:
              ticket.documentId,
          }
        );

        uploadStatus.textContent =
          'Document is veilig toegevoegd.';

        dialog.close();

        select.value =
          payload.organizationId;

        await Promise.all([
          loadInbox(),
          loadOrganization(),
        ]);
      } catch (uploadError) {
        errorBox.textContent =
          uploadError.message ||
          'Uploaden is niet gelukt.';

        uploadStatus.textContent = '';
      } finally {
        submit.disabled = false;
      }
    };

    dialog.showModal();
  }

  uploadOpen.addEventListener(
    'click',
    uploadDialog
  );

  async function openDocument(document) {
    const result = await api(
      `/api/documents/${encodeURIComponent(document.id)}/download?organizationId=${encodeURIComponent(document.organization_id)}`
    );

    const opened = window.open(
      result.url,
      '_blank',
      'noopener,noreferrer'
    );

    if (!opened) {
      window.location.assign(result.url);
    }
  }

  function processDialog(document) {
    if (document.source !== 'customer') return;

    const dialog =
      documentNode('dialog');

    dialog.className =
      'customer-dialog documents-process-dialog';

    const year =
      document.book_year ??
      new Date().getFullYear();

    dialog.innerHTML = `
      <form>
        <p class="eyebrow">Klantdocument verwerken</p>
        <h2>${escapeHtml(document.filename)}</h2>

        <fieldset>
          <label>
            Documenttype
            <select name="documentType" required>
              ${[
                ['purchase_invoice', 'Inkoopfactuur'],
                ['sales_invoice', 'Verkoopfactuur'],
                ['bank_document', 'Bankdocument'],
                ['tax_document', 'Belastingdocument'],
                ['payroll', 'Loonadministratie'],
                ['contract', 'Contract'],
                ['other', 'Overig'],
              ].map(([value, label]) =>
                `<option value="${value}" ${document.document_type === value ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </label>

          <label>
            Boekjaar
            <input
              name="bookYear"
              type="number"
              min="2000"
              max="2100"
              value="${escapeHtml(year)}"
            >
          </label>

          <label>
            Maand
            <select name="bookMonth">
              <option value="">Nog niet bepaald</option>
              ${[
                'Januari',
                'Februari',
                'Maart',
                'April',
                'Mei',
                'Juni',
                'Juli',
                'Augustus',
                'September',
                'Oktober',
                'November',
                'December',
              ].map((label, index) =>
                `<option value="${index + 1}" ${Number(document.book_month) === index + 1 ? 'selected' : ''}>${label}</option>`
              ).join('')}
            </select>
          </label>

          <label>
            Status
            <select name="status" required>
              <option value="new" ${document.status === 'new' ? 'selected' : ''}>
                Nieuw
              </option>
              <option value="in_review" ${document.status === 'in_review' ? 'selected' : ''}>
                In behandeling
              </option>
              <option value="needs_customer_action" ${document.status === 'needs_customer_action' ? 'selected' : ''}>
                Actie klant nodig
              </option>
              <option value="ready" ${document.status === 'ready' ? 'selected' : ''}>
                Gereed
              </option>
              <option value="processed" ${document.status === 'processed' ? 'selected' : ''}>
                Verwerkt
              </option>
            </select>
          </label>
        </fieldset>

        <p class="mutation-error" role="alert"></p>

        <div class="customer-buttons">
          <button type="submit" class="primary">
            Opslaan
          </button>

          <button type="button" data-cancel>
            Annuleren
          </button>
        </div>
      </form>
    `;

    root.append(dialog);

    const form =
      dialog.querySelector('form');

    dialog.querySelector('[data-cancel]')
      .onclick = () => dialog.close();

    dialog.addEventListener(
      'close',
      () => dialog.remove()
    );

    form.onsubmit = async event => {
      event.preventDefault();

      const submit =
        form.querySelector('[type=submit]');

      const error =
        form.querySelector('.mutation-error');

      submit.disabled = true;
      error.textContent = '';

      const values =
        Object.fromEntries(
          new FormData(form)
        );

      try {
        await api(
          `/api/documents/${encodeURIComponent(document.id)}/process`,
          {
            organizationId:
              document.organization_id,
            documentType:
              values.documentType,
            status:
              values.status,
            bookYear:
              values.bookYear || null,
            bookMonth:
              values.bookMonth || null,
          },
          'PATCH'
        );

        dialog.close();

        await Promise.all([
          loadInbox(),
          loadOrganization(),
        ]);

        status.textContent =
          'Documentverwerking opgeslagen.';
      } catch (requestError) {
        error.textContent =
          requestError.message ||
          'Opslaan is niet gelukt.';
      } finally {
        submit.disabled = false;
      }
    };

    dialog.showModal();
  }

  function documentNode(name) {
    return window.document.createElement(name);
  }

  function renderRows(target, documents, showOrganization) {
    if (!documents.length) {
      target.innerHTML = `
        <div class="office-documents-empty">
          <strong>Geen documenten</strong>
          <span>
            ${
              showOrganization
                ? 'De inbox is bijgewerkt.'
                : 'Voor deze onderneming zijn geen actieve documenten aanwezig.'
            }
          </span>
        </div>
      `;

      return;
    }

    target.innerHTML = `
      <div class="office-documents-table">
        <div class="office-documents-row office-documents-row--head">
          <span>Document</span>
          <span>${showOrganization ? 'Onderneming' : 'Type'}</span>
          <span>Status</span>
          <span>Datum</span>
          <span></span>
        </div>

        ${documents.map(document => `
          <div class="office-documents-row">
            <div>
              <strong>${escapeHtml(document.filename)}</strong>
              <small>
                ${escapeHtml(formatSize(document.size_bytes))}
                ? ${escapeHtml(sourceLabel(document.source))}
              </small>
            </div>

            <span>
              ${
                showOrganization
                  ? escapeHtml(
                      organizationMap.get(
                        document.organization_id
                      ) ?? 'Onbekende onderneming'
                    )
                  : escapeHtml(
                      typeLabel(document.document_type)
                    )
              }
            </span>

            <span>
              <em>
                ${escapeHtml(statusLabel(document.status))}
              </em>
            </span>

            <span>
              ${escapeHtml(formatDate(document.created_at))}
            </span>

            <div class="documents-row-actions">
              <button
                type="button"
                data-open="${escapeHtml(document.id)}"
              >
                Open
              </button>

              ${
                document.source === 'customer'
                && document.status !== 'archived'
                  ? `<button
                      type="button"
                      data-process="${escapeHtml(document.id)}"
                    >
                      Verwerken
                    </button>`
                  : ''
              }
            </div>
          </div>
        `).join('')}
      </div>
    `;

    const byId =
      new Map(
        documents.map(
          document => [
            document.id,
            document,
          ]
        )
      );

    target.querySelectorAll('[data-open]')
      .forEach(button => {
        button.onclick = async () => {
          button.disabled = true;

          try {
            await openDocument(
              byId.get(button.dataset.open)
            );
          } catch (error) {
            status.textContent =
              error.message ||
              'Document kon niet worden geopend.';
          } finally {
            button.disabled = false;
          }
        };
      });

    target.querySelectorAll('[data-process]')
      .forEach(button => {
        button.onclick = () => {
          const item =
            byId.get(button.dataset.process);

          if (item) processDialog(item);
        };
      });
  }


  function resetArchiveNavigation() {
    archiveState = {
      section: null,
      year: null,
      month: null,
      folder: null,
    };
  }

  function renderArchive() {
    if (!archive) return;

    if (!archiveDocuments.length) {
      archive.innerHTML = `
        <div class="office-documents-empty">
          <strong>Nog geen gearchiveerde documenten</strong>
          <span>
            Verwerkte documenten verschijnen hier automatisch.
          </span>
        </div>
      `;

      return;
    }

    const years =
      new Map();

    const visibleDocuments =
      archiveState.section
        ? archiveDocuments.filter(
            document =>
              archiveSection(
                archiveFolderLabel(
                  document
                )
              ) ===
              archiveState.section
          )
        : archiveDocuments;

    for (const document of visibleDocuments) {
      const {
        year,
        month,
      } =
        archiveDateParts(
          document
        );

      const folder =
        archiveFolderLabel(
          document
        );

      if (!years.has(year)) {
        years.set(
          year,
          new Map()
        );
      }

      const months =
        years.get(year);

      if (!months.has(month)) {
        months.set(
          month,
          new Map()
        );
      }

      const folders =
        months.get(month);

      if (!folders.has(folder)) {
        folders.set(
          folder,
          []
        );
      }

      folders
        .get(folder)
        .push(document);
    }

    const sortedYears =
      [...years.keys()]
        .sort(
          (a, b) =>
            b - a
        );

    const breadcrumb = `
      <nav class="office-archive-breadcrumb">
        <button
          type="button"
          data-archive-root
        >
          Archief
        </button>

        ${
          archiveState.year
            ? `
              <span>/</span>
              <button
                type="button"
                data-archive-year-root
              >
                ${escapeHtml(archiveState.year)}
              </button>
            `
            : ''
        }

        ${
          archiveState.month
            ? `
              <span>/</span>
              <button
                type="button"
                data-archive-month-root
              >
                ${escapeHtml(
                  monthNames[
                    archiveState.month - 1
                  ]
                )}
              </button>
            `
            : ''
        }

        ${
          archiveState.folder
            ? `
              <span>/</span>
              <strong>
                ${escapeHtml(
                  archiveState.folder
                )}
              </strong>
            `
            : ''
        }
      </nav>
    `;

    if (!archiveState.section) {
      archive.innerHTML = `
        ${breadcrumb}

        <div class="office-archive-grid office-archive-section-grid">

          <button
            type="button"
            class="office-archive-card office-archive-section-card"
            data-archive-section="monthly"
          >
            <span class="office-archive-card-icon">▣</span>
            <span>
              <strong>Archief</strong>
              <small>
                Facturen, bank en maanddocumenten
              </small>
            </span>
          </button>

          <button
            type="button"
            class="office-archive-card office-archive-section-card"
            data-archive-section="business"
          >
            <span class="office-archive-card-icon">▱</span>
            <span>
              <strong>Bedrijfsdossier</strong>
              <small>
                Vaste ondernemingsdocumenten
              </small>
            </span>
          </button>

          <button
            type="button"
            class="office-archive-card office-archive-section-card"
            data-archive-section="annual"
          >
            <span class="office-archive-card-icon">◫</span>
            <span>
              <strong>Jaarstukken</strong>
              <small>
                Jaarrekening, aangiften en rapportages
              </small>
            </span>
          </button>

        </div>
      `;
    }

    else if (!archiveState.year) {
      archive.innerHTML = `
        ${breadcrumb}

        <button
          type="button"
          class="office-archive-back"
          data-archive-back-sections
        >
          ← Terug naar documenten
        </button>

        <div class="office-archive-title">
          <span>Documenten</span>

          <h3>
            ${
              archiveState.section === 'monthly'
                ? 'Archief'
                : archiveState.section === 'business'
                  ? 'Bedrijfsdossier'
                  : 'Jaarstukken'
            }
          </h3>
        </div>

        <div class="office-archive-grid">
          ${
            sortedYears.map(
              year => {
                const months =
                  years.get(year);

                let count = 0;

                months.forEach(
                  folders =>
                    folders.forEach(
                      documents =>
                        count +=
                          documents.length
                    )
                );

                return `
                  <button
                    type="button"
                    class="office-archive-card"
                    data-archive-year="${escapeHtml(year)}"
                  >
                    <span class="office-archive-card-icon">
                      ▣
                    </span>

                    <span>
                      <strong>
                        ${escapeHtml(year)}
                      </strong>

                      <small>
                        ${count}
                        ${count === 1
                          ? 'document'
                          : 'documenten'}
                      </small>
                    </span>
                  </button>
                `;
              }
            ).join('')
          }
        </div>
      `;
    }

    else if (!archiveState.month) {
      const months =
        years.get(
          archiveState.year
        );

      const sortedMonths =
        [...months.keys()]
          .sort(
            (a, b) =>
              b - a
          );

      archive.innerHTML = `
        ${breadcrumb}

        <button
          type="button"
          class="office-archive-back"
          data-archive-back-years
        >
          ← Terug naar jaren
        </button>

        <div class="office-archive-title">
          <span>Boekjaar</span>
          <h3>
            ${escapeHtml(
              archiveState.year
            )}
          </h3>
        </div>

        <div class="office-archive-grid">
          ${
            sortedMonths.map(
              month => {
                const folders =
                  months.get(month);

                let count = 0;

                folders.forEach(
                  documents =>
                    count +=
                      documents.length
                );

                return `
                  <button
                    type="button"
                    class="office-archive-card"
                    data-archive-month="${escapeHtml(month)}"
                  >
                    <span class="office-archive-card-icon">
                      ◫
                    </span>

                    <span>
                      <strong>
                        ${escapeHtml(
                          monthNames[
                            month - 1
                          ]
                        )}
                      </strong>

                      <small>
                        ${count}
                        ${count === 1
                          ? 'document'
                          : 'documenten'}
                      </small>
                    </span>
                  </button>
                `;
              }
            ).join('')
          }
        </div>
      `;
    }

    else if (!archiveState.folder) {
      const folders =
        years
          .get(
            archiveState.year
          )
          .get(
            archiveState.month
          );

      const sortedFolders =
        [...folders.keys()]
          .sort(
            (a, b) =>
              String(a)
                .localeCompare(
                  String(b),
                  'nl'
                )
          );

      archive.innerHTML = `
        ${breadcrumb}

        <button
          type="button"
          class="office-archive-back"
          data-archive-back-months
        >
          ← Terug naar maanden
        </button>

        <div class="office-archive-title">
          <span>
            ${escapeHtml(
              archiveState.year
            )}
          </span>

          <h3>
            ${escapeHtml(
              monthNames[
                archiveState.month - 1
              ]
            )}
          </h3>
        </div>

        <div class="office-archive-grid">
          ${
            sortedFolders.map(
              folder => {
                const documents =
                  folders.get(folder);

                return `
                  <button
                    type="button"
                    class="office-archive-card"
                    data-archive-folder="${escapeHtml(folder)}"
                  >
                    <span class="office-archive-card-icon">
                      ▱
                    </span>

                    <span>
                      <strong>
                        ${escapeHtml(folder)}
                      </strong>

                      <small>
                        ${documents.length}
                        ${documents.length === 1
                          ? 'document'
                          : 'documenten'}
                      </small>
                    </span>
                  </button>
                `;
              }
            ).join('')
          }
        </div>
      `;
    }

    else {
      const documents =
        years
          .get(
            archiveState.year
          )
          .get(
            archiveState.month
          )
          .get(
            archiveState.folder
          ) ?? [];

      archive.innerHTML = `
        ${breadcrumb}

        <button
          type="button"
          class="office-archive-back"
          data-archive-back-folders
        >
          ← Terug naar mappen
        </button>

        <div class="office-archive-title">
          <span>
            ${
              escapeHtml(
                monthNames[
                  archiveState.month - 1
                ]
              )
            }
            ${escapeHtml(
              archiveState.year
            )}
          </span>

          <h3>
            ${escapeHtml(
              archiveState.folder
            )}
          </h3>
        </div>

        <div class="office-documents-table office-archive-documents">

          <div class="office-documents-row office-documents-row--head">
            <span>Document</span>
            <span>Type</span>
            <span>Status</span>
            <span>Datum</span>
            <span></span>
          </div>

          ${
            documents.map(
              document => `
                <div class="office-documents-row">
                  <div>
                    <strong>
                      ${escapeHtml(
                        document.filename
                      )}
                    </strong>

                    <small>
                      ${escapeHtml(
                        formatSize(
                          document.size_bytes
                        )
                      )}
                      ·
                      ${escapeHtml(
                        sourceLabel(
                          document.source
                        )
                      )}
                    </small>
                  </div>

                  <span>
                    ${escapeHtml(
                      typeLabel(
                        document.document_type
                      )
                    )}
                  </span>

                  <span>
                    <em>
                      ${escapeHtml(
                        statusLabel(
                          document.status
                        )
                      )}
                    </em>
                  </span>

                  <span>
                    ${escapeHtml(
                      formatDate(
                        document.processed_at
                        || document.archived_at
                        || document.created_at
                      )
                    )}
                  </span>

                  <div class="documents-row-actions">
                    <button
                      type="button"
                      data-archive-open="${escapeHtml(document.id)}"
                    >
                      Open
                    </button>
                  </div>
                </div>
              `
            ).join('')
          }

        </div>
      `;

      const byId =
        new Map(
          documents.map(
            document => [
              document.id,
              document,
            ]
          )
        );

      archive
        .querySelectorAll(
          '[data-archive-open]'
        )
        .forEach(
          button => {
            button.onclick =
              async () => {
                button.disabled =
                  true;

                try {
                  await openDocument(
                    byId.get(
                      button.dataset.archiveOpen
                    )
                  );
                } catch (
                  openError
                ) {
                  status.textContent =
                    openError.message
                    || 'Document kon niet worden geopend.';
                } finally {
                  button.disabled =
                    false;
                }
              };
          }
        );
    }

    const rootButton =
      archive.querySelector(
        '[data-archive-root]'
      );

    if (rootButton) {
      rootButton.onclick =
        () => {
          resetArchiveNavigation();
          renderArchive();
        };
    }

    const yearRoot =
      archive.querySelector(
        '[data-archive-year-root]'
      );

    if (yearRoot) {
      yearRoot.onclick =
        () => {
          archiveState.month =
            null;

          archiveState.folder =
            null;

          renderArchive();
        };
    }

    const monthRoot =
      archive.querySelector(
        '[data-archive-month-root]'
      );

    if (monthRoot) {
      monthRoot.onclick =
        () => {
          archiveState.folder =
            null;

          renderArchive();
        };
    }

    archive
      .querySelectorAll(
        '[data-archive-section]'
      )
      .forEach(
        button => {
          button.onclick =
            () => {
              archiveState.section =
                button.dataset.archiveSection;

              archiveState.year = null;
              archiveState.month = null;
              archiveState.folder = null;

              renderArchive();
            };
        }
      );

    const backSections =
      archive.querySelector(
        '[data-archive-back-sections]'
      );

    if (backSections) {
      backSections.onclick =
        () => {
          resetArchiveNavigation();
          renderArchive();
        };
    }

    archive
      .querySelectorAll(
        '[data-archive-year]'
      )
      .forEach(
        button => {
          button.onclick =
            () => {
              archiveState.year =
                Number(
                  button.dataset.archiveYear
                );

              archiveState.month =
                null;

              archiveState.folder =
                null;

              renderArchive();
            };
        }
      );

    archive
      .querySelectorAll(
        '[data-archive-month]'
      )
      .forEach(
        button => {
          button.onclick =
            () => {
              archiveState.month =
                Number(
                  button.dataset.archiveMonth
                );

              archiveState.folder =
                null;

              renderArchive();
            };
        }
      );

    archive
      .querySelectorAll(
        '[data-archive-folder]'
      )
      .forEach(
        button => {
          button.onclick =
            () => {
              archiveState.folder =
                button.dataset.archiveFolder;

              renderArchive();
            };
        }
      );

    const backYears =
      archive.querySelector(
        '[data-archive-back-years]'
      );

    if (backYears) {
      backYears.onclick =
        () => {
          resetArchiveNavigation();
          renderArchive();
        };
    }

    const backMonths =
      archive.querySelector(
        '[data-archive-back-months]'
      );

    if (backMonths) {
      backMonths.onclick =
        () => {
          archiveState.month =
            null;

          archiveState.folder =
            null;

          renderArchive();
        };
    }

    const backFolders =
      archive.querySelector(
        '[data-archive-back-folders]'
      );

    if (backFolders) {
      backFolders.onclick =
        () => {
          archiveState.folder =
            null;

          renderArchive();
        };
    }
  }

  async function loadInbox() {
    inbox.innerHTML = `
      <div class="office-documents-empty">
        <span>Inbox laden...</span>
      </div>
    `;

    try {
      const result =
        await api('/api/documents/inbox');

      const documents =
        Array.isArray(result.documents)
          ? result.documents
          : [];

      count.textContent =
        String(documents.length);

      renderRows(
        inbox,
        documents,
        true
      );
    } catch (error) {
      count.textContent = '!';

      inbox.innerHTML = `
        <p class="mutation-error" role="alert">
          ${escapeHtml(
            error.message ||
            'Inbox kon niet worden geladen.'
          )}
        </p>
      `;
    }
  }

  async function loadOrganization() {
    const organizationId =
      select.value;

    const version =
      ++requestVersion;

    if (!organizationId) {
      status.textContent =
        'Er is geen onderneming beschikbaar.';

      list.replaceChildren();

      archiveDocuments = [];
      resetArchiveNavigation();

      if (archive) {
        archive.replaceChildren();
      }

      return;
    }

    status.textContent =
      'Documenten veilig ophalen...';

    try {
      const [
        result,
        paidInvoiceResult,
      ] = await Promise.all([
        api(
          `/api/documents?organizationId=${encodeURIComponent(organizationId)}`
        ),
        api(
          `/api/documents/paid-sales-invoices?organizationId=${encodeURIComponent(organizationId)}`
        ),
      ]);

      if (version !== requestVersion) return;

      const regularDocuments =
        Array.isArray(result.documents)
          ? result.documents
          : [];

      const paidInvoiceDocuments =
        Array.isArray(
          paidInvoiceResult.documents
        )
          ? paidInvoiceResult.documents
          : [];

      const documents = [
        ...regularDocuments,
        ...paidInvoiceDocuments,
      ];

      const activeDocuments =
        documents.filter(
          document =>
            document.status !== 'archived'
        );

      archiveDocuments =
        documents.filter(
          document =>
            document.status === 'archived'
            || Boolean(document.archived_at)
            || Boolean(document.processed_at)
        );

      resetArchiveNavigation();

      status.textContent =
        `${documents.length} ${
          documents.length === 1
            ? 'document'
            : 'documenten'
        }`;

      renderRows(
        list,
        activeDocuments,
        false
      );

      renderArchive();
    } catch (error) {
      if (version !== requestVersion) return;

      status.textContent =
        error.message ||
        'Documenten konden niet worden opgehaald.';

      list.replaceChildren();

      archiveDocuments = [];
      resetArchiveNavigation();

      if (archive) {
        archive.replaceChildren();
      }
    }
  }

  select.addEventListener(
    'change',
    () => void loadOrganization()
  );

  refresh.addEventListener(
    'click',
    () => {
      void Promise.all([
        loadInbox(),
        loadOrganization(),
      ]);
    }
  );

  void Promise.all([
    loadInbox(),
    loadOrganization(),
  ]);
}
