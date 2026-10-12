"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type PersonalDocumentItem = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source:
    | "customer"
    | "office"
    | "email"
    | "system";
  status:
    | "new"
    | "in_review"
    | "needs_customer_action"
    | "ready"
    | "processed"
    | "archived";
  document_type:
    | "tax_document"
    | "insurance"
    | "identity"
    | "lifeplan"
    | "coaching"
    | "wealth"
    | "other";
  book_year: number | null;
  book_month: number | null;
  archive_folder_name: string | null;
  visible_to_customer: boolean;
  customer_action_required: boolean;
  acknowledgement_required: boolean;
  notes: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  customerOpenedAt: string | null;
  customerAcknowledgedAt: string | null;
};

type PersonalDocumentsResponse = {
  items: PersonalDocumentItem[];
  error?: string;
};

function formatSize(
  bytes: number,
) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function monthLabel(
  value: number | null,
) {
  if (!value) {
    return "Onbekende maand";
  }

  return new Intl.DateTimeFormat(
    "nl-NL",
    {
      month: "long",
    },
  ).format(
    new Date(
      2026,
      value - 1,
      1,
    ),
  );
}

function statusLabel(
  status:
    | "new"
    | "in_review"
    | "needs_customer_action"
    | "ready"
    | "processed"
    | "archived",
) {
  switch (status) {
    case "new":
      return "Nieuw";
    case "in_review":
      return "In behandeling";
    case "needs_customer_action":
      return "Actie nodig";
    case "ready":
      return "Klaar voor verwerking";
    case "processed":
      return "Verwerkt";
    case "archived":
      return "Gearchiveerd";
    default:
      return status;
  }
}

export function PersonalDocumentsView() {
  const [
    scope,
    setScope,
  ] = useState<
    "inbox" | "archive"
  >("inbox");

  const [
    items,
    setItems,
  ] = useState<
    PersonalDocumentItem[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    uploadFile,
    setUploadFile,
  ] = useState<File | null>(null);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    uploadMessage,
    setUploadMessage,
  ] = useState("");

  const [
    selectedArchiveGroup,
    setSelectedArchiveGroup,
  ] = useState<
    string | null
  >(null);

  const loadDocuments =
    useCallback(
      async (
        nextScope =
          scope,
      ) => {
        setLoading(true);
        setError("");

        try {
          const response =
            await fetch(
              `/api/personal/documents?scope=${encodeURIComponent(
                nextScope,
              )}`,
              {
                method: "GET",
                cache: "no-store",
              },
            );

          const data =
            (await response.json()) as
              PersonalDocumentsResponse;

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ||
                "Documenten konden niet worden geladen.",
            );
          }

          setItems(
            data.items ?? [],
          );
        } catch (
          caughtError
        ) {
          setError(
            caughtError instanceof
              Error
              ? caughtError.message
              : "Documenten konden niet worden geladen.",
          );
        } finally {
          setLoading(false);
        }
      },
      [scope],
    );

  useEffect(() => {
    loadDocuments(scope);
  }, [
    scope,
    loadDocuments,
  ]);

  const filteredItems =
    useMemo(() => {
      const needle =
        search
          .trim()
          .toLowerCase();

      return items.filter(
        (item) => {
          const bucket = [
            item.filename,
            item.notes ??
              "",
            item.archive_folder_name ??
              "",
          ]
            .join(" ")
            .toLowerCase();

          if (
            needle &&
            !bucket.includes(
              needle,
            )
          ) {
            return false;
          }

          if (
            scope ===
              "archive" &&
            selectedArchiveGroup
          ) {
            const groupKey =
              [
                item.book_year ??
                  "onbekend",
                item.book_month ??
                  "onbekend",
                item.archive_folder_name ??
                  "Algemeen",
              ].join("|");

            return (
              groupKey ===
              selectedArchiveGroup
            );
          }

          return true;
        },
      );
    }, [
      items,
      search,
      scope,
      selectedArchiveGroup,
    ]);

  const archiveGroups =
    useMemo(() => {
      if (
        scope !==
        "archive"
      ) {
        return [];
      }

      const map =
        new Map<
          string,
          {
            key: string;
            year: number | null;
            month: number | null;
            folder: string;
            count: number;
          }
        >();

      for (const item of items) {
        const key =
          [
            item.book_year ??
              "onbekend",
            item.book_month ??
              "onbekend",
            item.archive_folder_name ??
              "Verkoop / Algemeen",
          ].join("|");

        const current =
          map.get(key);

        if (
          current
        ) {
          current.count += 1;
          continue;
        }

        map.set(
          key,
          {
            key,
            year:
              item.book_year,
            month:
              item.book_month,
            folder:
              item.archive_folder_name ??
              "Verkoop / Algemeen",
            count: 1,
          },
        );
      }

      return Array.from(
        map.values(),
      ).sort(
        (a, b) =>
          (b.year ?? 0) -
            (a.year ?? 0) ||
          (b.month ?? 0) -
            (a.month ?? 0),
      );
    }, [
      items,
      scope,
    ]);

  async function uploadDocument() {
    if (!uploadFile) {
      setError(
        "Kies eerst een document.",
      );
      return;
    }

    setUploading(true);
    setError("");
    setUploadMessage("");

    try {
      const form =
        new FormData();

      form.append(
        "file",
        uploadFile,
      );

      const response =
        await fetch(
          "/api/personal/documents/upload",
          {
            method: "POST",
            body: form,
          },
        );

      const data =
        await response.json() as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Uploaden is niet gelukt.",
        );
      }

      setUploadFile(null);

      const input =
        document.getElementById(
          "personal-document-upload",
        ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      setUploadMessage(
        "Document toegevoegd aan jouw inbox.",
      );

      setScope(
        "inbox",
      );

      await loadDocuments(
        "inbox",
      );

    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Uploaden is niet gelukt.",
      );

    } finally {
      setUploading(false);
    }
  }


  async function openDocument(
    item: PersonalDocumentItem,
  ) {
    setError("");

    try {
      const response =
        await fetch(
          `/api/personal/documents/${encodeURIComponent(
            item.id,
          )}/download`,
          {
            method: "GET",
            cache:
              "no-store",
          },
        );

      const data =
        (await response.json()) as
          {
            url?: string;
            error?: string;
          };

      if (
        !response.ok ||
        !data.url
      ) {
        throw new Error(
          data.error ||
            "Het document kon niet worden geopend.",
        );
      }

      window.open(
        data.url,
        "_blank",
        "noopener,noreferrer",
      );

      const openedAt =
        new Date().toISOString();

      setItems(
        (current) =>
          current.map(
            (document) =>
              document.id ===
              item.id
                ? {
                    ...document,
                    customerOpenedAt:
                      document.customerOpenedAt ??
                      openedAt,
                  }
                : document,
          ),
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Het document kon niet worden geopend.",
      );
    }
  }

  async function acknowledgeDocument(
    item: PersonalDocumentItem,
  ) {
    setError("");

    try {
      const response =
        await fetch(
          `/api/personal/documents/${encodeURIComponent(
            item.id,
          )}/acknowledge`,
          {
            method:
              "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify({
                ok: true,
              }),
          },
        );

      const data =
        (await response.json()) as
          {
            result?: {
              openedAt:
                string | null;
              acknowledgedAt:
                string | null;
            };
            error?: string;
          };

      if (
        !response.ok ||
        !data.result
      ) {
        throw new Error(
          data.error ||
            "Leesbevestiging kon niet worden opgeslagen.",
        );
      }

      setItems(
        (current) =>
          current.map(
            (document) =>
              document.id ===
              item.id
                ? {
                    ...document,
                    customerOpenedAt:
                      data.result
                        ?.openedAt ??
                      document.customerOpenedAt,
                    customerAcknowledgedAt:
                      data.result
                        ?.acknowledgedAt ??
                      document.customerAcknowledgedAt,
                  }
                : document,
          ),
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Leesbevestiging kon niet worden opgeslagen.",
      );
    }
  }

  return (
    <section className="personal-documents">
      <div className="personal-documents-header">
        <div>
          <p className="personal-eyebrow">
            Mijn documenten
          </p>

          <h2 className="personal-section-title">
            Persoonlijke documenten
          </h2>

          <p className="personal-section-copy">
            Alles op één plek:
            inbox voor nog niet verwerkte documenten
            en archief voor documenten die al
            automatisch zijn ingedeeld.
          </p>
        </div>

        <div className="personal-documents-controls">
          <div className="personal-scope-tabs">
            <button
              type="button"
              className={
                scope === "inbox"
                  ? "is-active"
                  : ""
              }
              onClick={() => {
                setScope(
                  "inbox",
                );
                setSelectedArchiveGroup(
                  null,
                );
              }}
            >
              Inbox
            </button>

            <button
              type="button"
              className={
                scope === "archive"
                  ? "is-active"
                  : ""
              }
              onClick={() => {
                setScope(
                  "archive",
                );
              }}
            >
              Archief
            </button>
          </div>

          <input
            className="personal-search"
            type="search"
            placeholder="Zoek in documenten"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />
        </div>
      </div>

      {scope === "archive" &&
      archiveGroups.length >
        0 ? (
        <div className="personal-folder-grid">
          {archiveGroups.map(
            (
              group,
            ) => (
              <button
                key={
                  group.key
                }
                type="button"
                className={`personal-folder-card${
                  selectedArchiveGroup ===
                  group.key
                    ? " is-active"
                    : ""
                }`}
                onClick={() =>
                  setSelectedArchiveGroup(
                    (current) =>
                      current ===
                      group.key
                        ? null
                        : group.key,
                  )
                }
              >
                <div className="personal-folder-title">
                  {
                    group.folder
                  }
                </div>

                <div className="personal-folder-meta">
                  {group.year ??
                    "Onbekend"}{" "}
                  ·{" "}
                  {monthLabel(
                    group.month,
                  )}{" "}
                  ·{" "}
                  {group.count}{" "}
                  document(en)
                </div>
              </button>
            ),
          )}
        </div>
      ) : null}

      <section className="personal-upload-card">

        <div className="personal-upload-copy">
          <strong>
            Document toevoegen
          </strong>

          <p>
            Upload een document naar jouw persoonlijke inbox.
            Na verwerking wordt het automatisch in de juiste
            map in het archief geplaatst.
          </p>
        </div>

        <div className="personal-upload-actions">

          <label
            className="personal-file-picker"
            htmlFor="personal-document-upload"
          >
            {uploadFile
              ? uploadFile.name
              : "Kies document"}
          </label>

          <input
            id="personal-document-upload"
            className="personal-file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              setUploadFile(
                event.target.files?.[0] ??
                null,
              );

              setUploadMessage("");
              setError("");
            }}
          />

          <button
            type="button"
            className="personal-upload-button"
            disabled={
              !uploadFile ||
              uploading
            }
            onClick={
              uploadDocument
            }
          >
            {uploading
              ? "Uploaden..."
              : "Upload document"}
          </button>

        </div>

        {uploadMessage ? (
          <div
            className="personal-upload-success"
            role="status"
          >
            {uploadMessage}
          </div>
        ) : null}

      </section>


      {error ? (
        <div className="personal-inline-error">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="personal-documents-empty">
          Documenten laden...
        </div>
      ) : filteredItems.length ===
        0 ? (
        <div className="personal-documents-empty">
          {scope === "inbox"
            ? "Er staan nog geen persoonlijke documenten in jouw inbox."
            : "Er staan nog geen verwerkte persoonlijke documenten in jouw archief."}
        </div>
      ) : (
        <div className="personal-document-list">
          {filteredItems.map(
            (item) => (
              <article
                key={item.id}
                className="personal-document-card"
              >
                <div className="personal-document-main">
                  <div className="personal-document-topline">
                    <span className="personal-document-type">
                      {item.document_type.replaceAll(
                        "_",
                        " ",
                      )}
                    </span>

                    <span className={`personal-status-badge personal-status-${item.status}`}>
                      {statusLabel(
                        item.status,
                      )}
                    </span>
                  </div>

                  <h3 className="personal-document-name">
                    {item.filename}
                  </h3>

                  <div className="personal-document-meta">
                    <span>
                      {formatSize(
                        item.size_bytes,
                      )}
                    </span>
                    <span>
                      Bron:{" "}
                      {item.source}
                    </span>
                    {item.book_year ? (
                      <span>
                        {item.book_year}
                        {item.book_month
                          ? ` · ${monthLabel(item.book_month)}`
                          : ""}
                      </span>
                    ) : null}
                    {item.archive_folder_name ? (
                      <span>
                        Map:{" "}
                        {item.archive_folder_name}
                      </span>
                    ) : null}
                  </div>

                  {item.notes ? (
                    <p className="personal-document-notes">
                      {item.notes}
                    </p>
                  ) : null}

                  <div className="personal-document-flags">
                    {item.customer_action_required ? (
                      <span className="personal-flag warning">
                        Actie nodig
                      </span>
                    ) : null}

                    {item.acknowledgement_required ? (
                      <span className="personal-flag neutral">
                        Leesbevestiging gevraagd
                      </span>
                    ) : null}

                    {item.customerOpenedAt ? (
                      <span className="personal-flag success">
                        Geopend
                      </span>
                    ) : null}

                    {item.customerAcknowledgedAt ? (
                      <span className="personal-flag success">
                        Leesbevestiging opgeslagen
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="personal-document-actions">
                  <button
                    type="button"
                    className="personal-primary-button"
                    onClick={() =>
                      openDocument(
                        item,
                      )
                    }
                  >
                    Open document
                  </button>

                  {item.acknowledgement_required ? (
                    <button
                      type="button"
                      className="personal-secondary-button"
                      onClick={() =>
                        acknowledgeDocument(
                          item,
                        )
                      }
                    >
                      Bevestig gelezen
                    </button>
                  ) : null}
                </div>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}
