"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Download,
  FileImage,
  FileText,
  FolderArchive,
  FolderOpen,
  Inbox,
  LoaderCircle,
  Search,
  UploadCloud,
} from "lucide-react";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";

type DocumentsViewProps = {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo?: (view: string) => void;
};

type DocumentScope =
  | "inbox"
  | "archive";

type DocumentItem = {
  id: string;
  organization_id: string;
  folder_id: string | null;
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
    | "purchase_invoice"
    | "sales_invoice"
    | "bank_document"
    | "tax_document"
    | "payroll"
    | "contract"
    | "other";
  book_year: number | null;
  book_month: number | null;
  archive_folder_name: string | null;
  visible_to_customer: boolean;
  customer_action_required: boolean;
  acknowledgement_required: boolean;
  customerOpenedAt: string | null;
  customerAcknowledgedAt: string | null;
  notes: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type DocumentsResponse = {
  items: DocumentItem[];
  error?: string;
};

type BankDocumentRequest = {
  requestId: string;
  transactionId: string;
  organizationId: string;
  organizationName: string;
  counterpartyName: string | null;
  amountCents: number;
  transactionDate: string;
  description: string | null;
  status:
    | "requested"
    | "received"
    | "cancelled";
  documentId: string | null;
  requestedAt: string;
  receivedAt: string | null;
};

type BankDocumentRequestResponse = {
  request?: BankDocumentRequest;
  error?: string;
};

const maxFileSize =
  50 * 1024 * 1024;

const acceptedMimeTypes =
  new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
  ]);

const longDate =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    },
  );

const shortDate =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );

const euro =
  new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
    },
  );

const monthName =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      month: "long",
    },
  );

function fileSize(
  bytes: number,
) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function statusLabel(
  status: DocumentItem["status"],
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

function sourceLabel(
  source: DocumentItem["source"],
) {
  switch (source) {
    case "customer":
      return "Door u";
    case "office":
      return "Door administratie";
    case "email":
      return "Per e-mail";
    case "system":
      return "Automatisch";
    default:
      return source;
  }
}

function typeLabel(
  type: DocumentItem["document_type"],
) {
  switch (type) {
    case "purchase_invoice":
      return "Inkoopfactuur";
    case "sales_invoice":
      return "Verkoopfactuur";
    case "bank_document":
      return "Bank";
    case "tax_document":
      return "Belasting";
    case "payroll":
      return "Lonen";
    case "contract":
      return "Contract";
    case "other":
      return "Overig";
    default:
      return type;
  }
}

function FileIcon({
  mimeType,
}: {
  mimeType: string;
}) {
  if (
    mimeType === "image/png" ||
    mimeType === "image/jpeg"
  ) {
    return <FileImage />;
  }

  return <FileText />;
}

export default function DocumentsView({
  context,
  organization,
  onGo,
}: DocumentsViewProps) {
  const [
    scope,
    setScope,
  ] =
    useState<DocumentScope>(
      "inbox",
    );

  const [
    items,
    setItems,
  ] =
    useState<DocumentItem[]>(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    uploading,
    setUploading,
  ] =
    useState(false);

  const [
    acknowledgingId,
    setAcknowledgingId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    dragActive,
    setDragActive,
  ] =
    useState(false);

  const [
    bankRequest,
    setBankRequest,
  ] =
    useState<BankDocumentRequest | null>(
      null,
    );

  const [
    bankRequestLoading,
    setBankRequestLoading,
  ] =
    useState(false);

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const selected =
    useMemo(
      () =>
        items.find(
          (item) =>
            item.id ===
            selectedId,
        ) ?? null,
      [
        items,
        selectedId,
      ],
    );

  const filteredItems =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return items;
      }

      return items.filter(
        (item) =>
          item.filename
            .toLowerCase()
            .includes(query) ||
          typeLabel(
            item.document_type,
          )
            .toLowerCase()
            .includes(query) ||
          sourceLabel(
            item.source,
          )
            .toLowerCase()
            .includes(query),
      );
    }, [
      items,
      search,
    ]);

  const archiveGroups =
    useMemo(() => {
      const groups =
        new Map<
          string,
          {
            year: number;
            month: number;
            folder: string;
            items: DocumentItem[];
          }
        >();

      for (
        const item of filteredItems
      ) {
        const date =
          new Date(
            item.processed_at ??
              item.created_at,
          );

        const year =
          item.book_year ??
          date.getFullYear();

        const month =
          item.book_month ??
          date.getMonth() + 1;

        const folder =
          item.archive_folder_name ??
          typeLabel(
            item.document_type,
          );

        const key =
          `${year}-${month}-${folder}`;

        const existing =
          groups.get(key);

        if (existing) {
          existing.items.push(
            item,
          );
        } else {
          groups.set(
            key,
            {
              year,
              month,
              folder,
              items: [
                item,
              ],
            },
          );
        }
      }

      return Array.from(
        groups.values(),
      ).sort(
        (a, b) =>
          b.year - a.year ||
          b.month - a.month ||
          a.folder.localeCompare(
            b.folder,
            "nl",
          ),
      );
    }, [
      filteredItems,
    ]);

  const loadDocuments =
    useCallback(
      async (
        nextScope =
          scope,
      ) => {
        if (
          context.organizationId ===
          "all"
        ) {
          setItems([]);
          setSelectedId(
            null,
          );
          setLoading(false);
          setError("");
          return;
        }

        setLoading(true);
        setError("");

        try {
          const response =
            await fetch(
              `/api/documents?organizationId=${encodeURIComponent(
                context.organizationId,
              )}&scope=${encodeURIComponent(
                nextScope,
              )}`,
              {
                method:
                  "GET",
                cache:
                  "no-store",
              },
            );

          const data =
            (await response.json()) as
              DocumentsResponse;

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ||
                "Documenten konden niet worden geladen.",
            );
          }

          setItems(
            data.items ??
              [],
          );

          setSelectedId(
            (current) => {
              if (
                current &&
                data.items?.some(
                  (item) =>
                    item.id ===
                    current,
                )
              ) {
                return current;
              }

              return (
                data.items?.[0]
                  ?.id ??
                null
              );
            },
          );
        } catch (
          caughtError
        ) {
          setItems([]);
          setSelectedId(
            null,
          );
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
      [
        context.organizationId,
        scope,
      ],
    );

  useEffect(() => {
    void loadDocuments(
      scope,
    );
  }, [
    loadDocuments,
    scope,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    async function loadBankDocumentRequest() {
      const url =
        new URL(
          window.location.href,
        );

      if (
        url.searchParams.get(
          "action",
        ) !== "upload-document"
      ) {
        return;
      }

      const requestId =
        url.searchParams.get(
          "request",
        );

      const transactionId =
        url.searchParams.get(
          "transaction",
        );

      if (
        !requestId ||
        !transactionId
      ) {
        setError(
          "Dit documentverzoek is niet meer beschikbaar.",
        );
        return;
      }

      setBankRequestLoading(
        true,
      );

      setError("");

      try {
        const response =
          await fetch(
            `/api/documents/request?requestId=${encodeURIComponent(
              requestId,
            )}&transactionId=${encodeURIComponent(
              transactionId,
            )}`,
            {
              method:
                "GET",
              cache:
                "no-store",
            },
          );

        const data =
          (await response.json()) as
            BankDocumentRequestResponse;

        if (
          !response.ok ||
          !data.request
        ) {
          throw new Error(
            data.error ||
              "Dit documentverzoek is niet meer beschikbaar.",
          );
        }

        if (!cancelled) {
          setBankRequest(
            data.request,
          );

          setScope(
            "inbox",
          );
        }
      } catch (
        caughtError
      ) {
        if (!cancelled) {
          setBankRequest(
            null,
          );

          setError(
            caughtError instanceof
              Error
              ? caughtError.message
              : "Dit documentverzoek is niet meer beschikbaar.",
          );
        }
      } finally {
        if (!cancelled) {
          setBankRequestLoading(
            false,
          );
        }
      }
    }

    void loadBankDocumentRequest();

    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadFile(
    file: File,
  ) {
    if (
      context.organizationId ===
      "all"
    ) {
      setError(
        "Selecteer eerst één onderneming.",
      );
      return;
    }

    if (
      !acceptedMimeTypes.has(
        file.type,
      )
    ) {
      setError(
        "Alleen PDF-, JPG- en PNG-bestanden zijn toegestaan.",
      );
      return;
    }

    if (
      file.size >
      maxFileSize
    ) {
      setError(
        "Een document mag maximaal 50 MB groot zijn.",
      );
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const formData =
        new FormData();

      const uploadOrganizationId =
        bankRequest?.organizationId ??
        context.organizationId;

      formData.append(
        "organizationId",
        uploadOrganizationId,
      );

      formData.append(
        "file",
        file,
      );

      const response =
        await fetch(
          "/api/documents",
          {
            method:
              "POST",
            body:
              formData,
          },
        );

      const data =
        (await response.json()) as
          {
            item?: DocumentItem;
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Uploaden is niet gelukt.",
        );
      }

      if (
        bankRequest &&
        data.item?.id
      ) {
        const completeResponse =
          await fetch(
            "/api/documents/request",
            {
              method:
                "PATCH",

              headers: {
                "content-type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  requestId:
                    bankRequest.requestId,

                  transactionId:
                    bankRequest.transactionId,

                  documentId:
                    data.item.id,
                }),
            },
          );

        const completeData =
          (await completeResponse.json()) as
            BankDocumentRequestResponse;

        if (
          !completeResponse.ok
        ) {
          throw new Error(
            completeData.error ||
              "Het document is geüpload, maar kon niet aan het verzoek worden gekoppeld.",
          );
        }

        setBankRequest(
          (current) =>
            current
              ? {
                  ...current,
                  status:
                    "received",
                  documentId:
                    data.item?.id ??
                    null,
                  receivedAt:
                    new Date()
                      .toISOString(),
                }
              : null,
        );

        setSuccess(
          "Document ontvangen. Uw administratie controleert het document en verwerkt daarna de betaling.",
        );

        const cleanUrl =
          new URL(
            window.location.href,
          );

        cleanUrl.searchParams.delete(
          "action",
        );

        cleanUrl.searchParams.delete(
          "request",
        );

        cleanUrl.searchParams.delete(
          "transaction",
        );

        window.history.replaceState(
          {},
          "",
          `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
        );
      } else {
        setSuccess(
          `${file.name} is veilig toegevoegd aan Documenten.`,
        );
      }

      setScope(
        "inbox",
      );

      await loadDocuments(
        "inbox",
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Uploaden is niet gelukt.",
      );
    } finally {
      setUploading(false);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    }
  }

  async function openDocument(
    item: DocumentItem,
  ) {
    setError("");

    try {
      const response =
        await fetch(
          `/api/documents/${encodeURIComponent(
            item.id,
          )}/download?organizationId=${encodeURIComponent(
            context.organizationId,
          )}`,
          {
            method:
              "GET",
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

      if (
        item.source ===
        "office"
      ) {
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
      }
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
    item: DocumentItem,
  ) {
    setAcknowledgingId(
      item.id,
    );
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          `/api/documents/${encodeURIComponent(
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
                organizationId:
                  context.organizationId,
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

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Leesbevestiging kon niet worden opgeslagen.",
        );
      }

      const acknowledgedAt =
        data.result
          ?.acknowledgedAt ??
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
                      acknowledgedAt,
                    customerAcknowledgedAt:
                      acknowledgedAt,
                  }
                : document,
          ),
      );

      setSuccess(
        "Uw leesbevestiging is opgeslagen. Het document is automatisch gearchiveerd.",
      );

      await loadDocuments(
        scope,
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
    } finally {
      setAcknowledgingId(
        null,
      );
    }
  }

  function changeScope(
    next:
      DocumentScope,
  ) {
    setScope(next);
    setSearch("");
    setSelectedId(
      null,
    );
    setError("");
    setSuccess("");
  }

  function onDrop(
    event:
      React.DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setDragActive(
      false,
    );

    const file =
      event.dataTransfer
        .files?.[0];

    if (file) {
      void uploadFile(
        file,
      );
    }
  }

  if (
    context.organizationId ===
    "all"
  ) {
    return (
      <section className="documents-empty-state">
        <FolderOpen />

        <h1>Documenten</h1>

        <p>
          Selecteer bovenaan eerst één
          onderneming om de beveiligde
          documentenomgeving te openen.
        </p>

        <button
          type="button"
          className="btn"
          onClick={() =>
            onGo?.(
              "Dashboard",
            )
          }
        >
          <ArrowLeft />
          Terug naar dashboard
        </button>
      </section>
    );
  }

  return (
    <div className="documents-page">
      <header className="documents-header">
        <div>
          <span className="documents-eyebrow">
            Beveiligde documenten
          </span>

          <h1>Documenten</h1>

          <p>
            Deel documenten met uw
            administratie en bekijk
            documenten die voor u zijn
            klaargezet.
          </p>
        </div>

        <button
          type="button"
          className="documents-upload-button"
          disabled={
            uploading
          }
          onClick={() =>
            fileInputRef.current?.click()
          }
        >
          {uploading ? (
            <LoaderCircle className="documents-spin" />
          ) : (
            <UploadCloud />
          )}

          {uploading
            ? "Uploaden..."
            : "Document uploaden"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          hidden
          onChange={(
            event,
          ) => {
            const file =
              event.target
                .files?.[0];

            if (file) {
              void uploadFile(
                file,
              );
            }
          }}
        />
      </header>

      <div className="documents-context">
        <span>
          <FolderOpen />
          {bankRequest?.organizationName ??
            organization?.name ??
            "Uw onderneming"}
        </span>

        <span>
          PDF, JPG en PNG · maximaal
          50 MB
        </span>
      </div>

      {bankRequestLoading && (
        <div className="notice">
          Documentverzoek wordt geladen...
        </div>
      )}

      {bankRequest && (
        <section className="card">
          <span className="documents-section-label">
            Actie nodig
          </span>

          <h2>
            {bankRequest.status ===
            "received"
              ? "Document ontvangen"
              : "Factuur of bon uploaden"}
          </h2>

          {bankRequest.status ===
          "received" ? (
            <p>
              Dit document is al ontvangen.
              U hoeft niets meer te doen.
              Uw administratie controleert
              het document.
            </p>
          ) : (
            <>
              <p>
                Voor onderstaande betaling
                ontbreekt nog een factuur
                of bon.
              </p>

              <dl className="customer-status-list">
                <div>
                  <dt>
                    Leverancier
                  </dt>

                  <dd>
                    {bankRequest.counterpartyName ||
                      "Onbekende leverancier"}
                  </dd>
                </div>

                <div>
                  <dt>
                    Bedrag
                  </dt>

                  <dd>
                    {euro.format(
                      Math.abs(
                        bankRequest.amountCents,
                      ) / 100,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Datum
                  </dt>

                  <dd>
                    {shortDate.format(
                      new Date(
                        `${bankRequest.transactionDate}T12:00:00`,
                      ),
                    )}
                  </dd>
                </div>

                {bankRequest.description && (
                  <div>
                    <dt>
                      Omschrijving
                    </dt>

                    <dd>
                      {
                        bankRequest.description
                      }
                    </dd>
                  </div>
                )}
              </dl>

              <p>
                <button
                  type="button"
                  className="btn primary"
                  disabled={
                    uploading
                  }
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                >
                  <UploadCloud />

                  {uploading
                    ? "Uploaden..."
                    : "Factuur of bon kiezen"}
                </button>
              </p>
            </>
          )}
        </section>
      )}

      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div className="documents-success">
          {success}
        </div>
      )}

      <section className="documents-workspace">
        <aside className="documents-sidebar">
          <div className="documents-sidebar-title">
            Documenten
          </div>

          <button
            type="button"
            className={
              scope ===
              "inbox"
                ? "active"
                : ""
            }
            onClick={() =>
              changeScope(
                "inbox",
              )
            }
          >
            <Inbox />

            <span>Inbox</span>

            {scope ===
              "inbox" && (
              <b>
                {
                  items.length
                }
              </b>
            )}
          </button>

          <button
            type="button"
            className={
              scope ===
              "archive"
                ? "active"
                : ""
            }
            onClick={() =>
              changeScope(
                "archive",
              )
            }
          >
            <Archive />

            <span>Archief</span>
          </button>

          <div className="documents-sidebar-separator" />

          <div className="documents-sidebar-label">
            Werkwijze
          </div>

          <p>
            Nieuwe documenten blijven
            in de inbox staan totdat uw
            administratie ze heeft
            verwerkt.
          </p>

          <p>
            Verwerkte documenten worden
            automatisch teruggevonden
            per boekjaar, maand en map.
          </p>
        </aside>

        <main className="documents-content">
          <div className="documents-toolbar">
            <div>
              <span className="documents-section-label">
                {scope ===
                "inbox"
                  ? "Actuele documenten"
                  : "Archief"}
              </span>

              <h2>
                {scope ===
                "inbox"
                  ? "Inbox"
                  : "Verwerkte documenten"}
              </h2>
            </div>

            <label className="documents-search">
              <Search />

              <input
                type="search"
                value={
                  search
                }
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event.target
                      .value,
                  )
                }
                placeholder="Zoeken in documenten"
              />
            </label>
          </div>

          {scope ===
            "inbox" && (
            <div
              className={`documents-dropzone ${
                dragActive
                  ? "active"
                  : ""
              }`}
              onDragOver={(
                event,
              ) => {
                event.preventDefault();
                setDragActive(
                  true,
                );
              }}
              onDragLeave={() =>
                setDragActive(
                  false,
                )
              }
              onDrop={
                onDrop
              }
              onClick={() =>
                fileInputRef.current?.click()
              }
              role="button"
              tabIndex={0}
              onKeyDown={(
                event,
              ) => {
                if (
                  event.key ===
                    "Enter" ||
                  event.key ===
                    " "
                ) {
                  fileInputRef.current?.click();
                }
              }}
            >
              <UploadCloud />

              <div>
                <strong>
                  Sleep een document
                  hierheen
                </strong>

                <span>
                  of klik om een PDF,
                  JPG of PNG te kiezen
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="documents-loading">
              <LoaderCircle className="documents-spin" />
              Documenten worden
              geladen...
            </div>
          ) : scope ===
              "inbox" ? (
            <div className="documents-inbox-layout">
              <div className="documents-list">
                <div className="documents-list-head">
                  <span>Naam</span>
                  <span>Bron</span>
                  <span>Status</span>
                  <span>Datum</span>
                </div>

                {filteredItems.length ===
                0 ? (
                  <div className="documents-list-empty">
                    <Inbox />

                    <strong>
                      Inbox is leeg
                    </strong>

                    <span>
                      Er zijn geen
                      onverwerkte
                      documenten gevonden.
                    </span>
                  </div>
                ) : (
                  filteredItems.map(
                    (item) => (
                      <button
                        type="button"
                        key={
                          item.id
                        }
                        className={`documents-row ${
                          selectedId ===
                          item.id
                            ? "selected"
                            : ""
                        }`}
                        onClick={() =>
                          setSelectedId(
                            item.id,
                          )
                        }
                      >
                        <span className="documents-file-name">
                          <i>
                            <FileIcon
                              mimeType={
                                item.mime_type
                              }
                            />
                          </i>

                          <span>
                            <strong>
                              {
                                item.filename
                              }
                            </strong>

                            <small>
                              {typeLabel(
                                item.document_type,
                              )}{" "}
                              ·{" "}
                              {fileSize(
                                item.size_bytes,
                              )}
                            </small>
                          </span>
                        </span>

                        <span>
                          {sourceLabel(
                            item.source,
                          )}
                        </span>

                        <span>
                          <b
                            className={`documents-status ${item.status}`}
                          >
                            {statusLabel(
                              item.status,
                            )}
                          </b>
                        </span>

                        <span>
                          {shortDate.format(
                            new Date(
                              item.created_at,
                            ),
                          )}
                        </span>
                      </button>
                    ),
                  )
                )}
              </div>

              <aside className="documents-detail">
                {selected ? (
                  <>
                    <div className="documents-detail-icon">
                      <FileIcon
                        mimeType={
                          selected.mime_type
                        }
                      />
                    </div>

                    <span className="documents-section-label">
                      Document
                    </span>

                    <h3>
                      {
                        selected.filename
                      }
                    </h3>

                    <dl>
                      <div>
                        <dt>Status</dt>
                        <dd>
                          {statusLabel(
                            selected.status,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Bron</dt>
                        <dd>
                          {sourceLabel(
                            selected.source,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Type</dt>
                        <dd>
                          {typeLabel(
                            selected.document_type,
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Ontvangen</dt>
                        <dd>
                          {longDate.format(
                            new Date(
                              selected.created_at,
                            ),
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt>Bestand</dt>
                        <dd>
                          {fileSize(
                            selected.size_bytes,
                          )}
                        </dd>
                      </div>
                    </dl>

                    {selected.customer_action_required && (
                      <div className="documents-action-needed">
                        Uw administratie
                        heeft nog actie
                        van u nodig voor
                        dit document.
                      </div>
                    )}

                    {selected.notes && (
                      <div className="documents-note">
                        <strong>
                          Opmerking
                        </strong>

                        <p>
                          {
                            selected.notes
                          }
                        </p>
                      </div>
                    )}

                    {selected.source ===
                      "office" && (
                      <div className="documents-read-status">
                        {selected.customerAcknowledgedAt ? (
                          <div className="documents-read-confirmed">
                            <strong>
                              ✓ Gelezen bevestigd
                            </strong>

                            <span>
                              {longDate.format(
                                new Date(
                                  selected.customerAcknowledgedAt,
                                ),
                              )}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div>
                              <strong>
                                Leesbevestiging
                              </strong>

                              <span>
                                {selected.customerOpenedAt
                                  ? "U heeft dit document geopend. Bevestig dat u het heeft gelezen."
                                  : "Open het document en bevestig daarna dat u het heeft gelezen."}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="documents-acknowledge-button"
                              disabled={
                                acknowledgingId ===
                                selected.id
                              }
                              onClick={() =>
                                void acknowledgeDocument(
                                  selected,
                                )
                              }
                            >
                              {acknowledgingId ===
                              selected.id
                                ? "Opslaan..."
                                : "Bevestig als gelezen"}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      className="documents-open-button"
                      onClick={() =>
                        void openDocument(
                          selected,
                        )
                      }
                    >
                      <Download />
                      Document openen
                    </button>
                  </>
                ) : (
                  <div className="documents-detail-empty">
                    <FileText />

                    <strong>
                      Selecteer een
                      document
                    </strong>

                    <span>
                      De details
                      verschijnen hier.
                    </span>
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <div className="documents-archive">
              {archiveGroups.length ===
              0 ? (
                <div className="documents-list-empty archive">
                  <FolderArchive />

                  <strong>
                    Nog geen
                    gearchiveerde
                    documenten
                  </strong>

                  <span>
                    Verwerkte documenten
                    verschijnen hier per
                    boekjaar, maand en
                    map.
                  </span>
                </div>
              ) : (
                archiveGroups.map(
                  (group) => (
                    <section
                      className="documents-archive-group"
                      key={`${group.year}-${group.month}-${group.folder}`}
                    >
                      <header>
                        <div className="documents-archive-folder">
                          <FolderArchive />

                          <div>
                            <strong>
                              {
                                group.folder
                              }
                            </strong>

                            <span>
                              {monthName.format(
                                new Date(
                                  group.year,
                                  group.month -
                                    1,
                                  1,
                                ),
                              )}{" "}
                              {group.year}
                            </span>
                          </div>
                        </div>

                        <b>
                          {
                            group.items
                              .length
                          }{" "}
                          document
                          {group.items
                            .length ===
                          1
                            ? ""
                            : "en"}
                        </b>
                      </header>

                      <div className="documents-archive-files">
                        {group.items.map(
                          (item) => (
                            <button
                              type="button"
                              key={
                                item.id
                              }
                              onClick={() =>
                                void openDocument(
                                  item,
                                )
                              }
                            >
                              <span className="documents-file-name">
                                <i>
                                  <FileIcon
                                    mimeType={
                                      item.mime_type
                                    }
                                  />
                                </i>

                                <span>
                                  <strong>
                                    {
                                      item.filename
                                    }
                                  </strong>

                                  <small>
                                    {typeLabel(
                                      item.document_type,
                                    )}{" "}
                                    ·{" "}
                                    {fileSize(
                                      item.size_bytes,
                                    )}
                                  </small>
                                </span>
                              </span>

                              <span>
                                {sourceLabel(
                                  item.source,
                                )}
                              </span>

                              <span>
                                {shortDate.format(
                                  new Date(
                                    item.processed_at ??
                                      item.created_at,
                                  ),
                                )}
                              </span>

                              <Download />
                            </button>
                          ),
                        )}
                      </div>
                    </section>
                  ),
                )
              )}
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
