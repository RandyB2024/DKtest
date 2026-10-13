"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CalendarDays,
  CalendarClock,
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  FolderOpen,
  LayoutDashboard,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Camera,
  Image,
  FileUp,
  ChevronLeft,
  ChevronRight,
  Settings,
  Umbrella,
  Users,
  WalletCards,
} from "lucide-react";

import type { PortalContext } from "@/lib/portal-access";

import AppointmentsView from "./appointments-view";
import BankingView from "./banking-view";
import CustomerDashboard from "./customer-dashboard";
import InstallApp from "./install-app";
import InvoiceDetailView from "./invoice-detail-view";
import InventoryView from "./inventory-view";
import Logout from "./logout";
import PasskeySettings from "./passkey-settings";
import RelationsView from "./relations-view";
import DocumentsView from "./documents-view";
import CommunicationView from "./communication-view";

const businessNav = [
  ["Dashboard", LayoutDashboard],
  ["Bankieren", WalletCards],
  ["Relaties", Users],
  ["Documenten", FolderOpen],
  ["Communicatie", MessagesSquare],
  ["Afspraken", CalendarDays],
  ["Rapportages", ChartNoAxesCombined],
  ["Aangiften", ClipboardCheck],
  ["Bedrijfsmiddelen", Boxes],
  ["Verzekeringen", Umbrella],
  ["Instellingen", Settings],
] as const;

const nav =
  businessNav;

export default function Portal({
  context,
  onContext,
  onRefresh,
}: {
  context: PortalContext;
  onContext: (
    context: PortalContext,
  ) => void;
  onRefresh: () => Promise<void>;
}) {
  const [view, setView] =
    useState("Dashboard");

  const [
    mobileMoreOpen,
    setMobileMoreOpen,
  ] = useState(false);

  const [
    mobileUploadOpen,
    setMobileUploadOpen,
  ] = useState(false);

  const [
    mobileUploading,
    setMobileUploading,
  ] = useState(false);

  const cameraInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const galleryInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const fileUploadInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const [
    sidebarCollapsed,
    setSidebarCollapsed,
  ] = useState(false);

  useEffect(() => {
    const stored =
      window.localStorage.getItem(
        "bestemd-portal-sidebar-collapsed",
      );

    setSidebarCollapsed(
      stored === "1",
    );
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed(
      (current) => {
        const next = !current;

        window.localStorage.setItem(
          "bestemd-portal-sidebar-collapsed",
          next ? "1" : "0",
        );

        return next;
      },
    );
  }

  useEffect(() => {
    const url =
      new URL(
        window.location.href,
      );

    if (
      url.searchParams.get(
        "view",
      ) === "communication"
    ) {
      setView(
        "Communicatie",
      );
    }

    if (
      url.searchParams.get(
        "action",
      ) === "upload-document" &&
      url.searchParams.get(
        "request",
      ) &&
      url.searchParams.get(
        "transaction",
      )
    ) {
      setView(
        "Documenten",
      );
    }
  }, []);

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  async function uploadMobileDocument(
    file: File,
  ) {
    if (
      context.organizationId ===
      "all"
    ) {
      setMobileUploadOpen(false);
      setError(
        "Selecteer eerst één onderneming voordat je een document uploadt.",
      );
      return;
    }

    const acceptedTypes =
      new Set([
        "application/pdf",
        "image/jpeg",
        "image/png",
      ]);

    if (
      !acceptedTypes.has(
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
      50 * 1024 * 1024
    ) {
      setError(
        "Een document mag maximaal 50 MB groot zijn.",
      );
      return;
    }

    setMobileUploading(true);
    setError("");

    try {
      const formData =
        new FormData();

      formData.append(
        "organizationId",
        context.organizationId,
      );

      formData.append(
        "file",
        file,
      );

      const response =
        await fetch(
          "/api/documents",
          {
            method: "POST",
            body: formData,
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Uploaden is niet gelukt.",
        );
      }

      setMobileUploadOpen(false);
      setMobileMoreOpen(false);

      setView(
        "Documenten",
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Uploaden is niet gelukt.",
      );
    } finally {
      setMobileUploading(false);

      if (
        cameraInputRef.current
      ) {
        cameraInputRef.current.value =
          "";
      }

      if (
        galleryInputRef.current
      ) {
        galleryInputRef.current.value =
          "";
      }

      if (
        fileUploadInputRef.current
      ) {
        fileUploadInputRef.current.value =
          "";
      }
    }
  }

  const organization =
    context.organizations.find(
      (o) =>
        o.id ===
        context.organizationId,
    );

  const visibleOrganizations =
    context.organizationId === "all"
      ? context.organizations
      : context.organizations.filter(
          (o) =>
            o.id ===
            context.organizationId,
        );

  async function switchOrganization(
    id: string,
  ) {
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/context",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              organizationId: id,
            }),
          },
        );

      const data =
        (await response.json()) as
          PortalContext & {
            error?: string;
          };

      if (!response.ok) {
        await onRefresh();

        throw new Error(
          data.error ||
            "Onderneming wisselen is niet gelukt.",
        );
      }

      onContext(data);

      setView("Dashboard");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Onderneming wisselen is niet gelukt.",
      );
    } finally {
      setBusy(false);
    }
  }

  const switcher =
    context.organizations.length >
    1 ? (
      <div className="field">
        <label htmlFor="organization">
          Huidige onderneming
        </label>

        <select
          id="organization"
          disabled={busy}
          value={
            context.organizationId
          }
          onChange={(event) =>
            switchOrganization(
              event.target.value,
            )
          }
        >
          <option value="all">
            Alle ondernemingen
          </option>

          {context.organizations.map(
            (item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.name}
              </option>
            ),
          )}
        </select>
      </div>
    ) : null;

  function renderView() {
    if (view === "Dashboard") {
      return (
        <CustomerDashboard
          context={context}
          organization={
            organization
          }
          onGo={setView}
        />
      );
    }

    if (view === "Bankieren") {
      return (
        <BankingView
          context={context}
          organization={
            organization
          }
          onGo={setView}
        />
      );
    }

    if (
      view === "Relaties" ||
      view === "Klanten" ||
      view === "Leveranciers"
    ) {
      return (
        <RelationsView
          context={context}
          organization={organization}
          onGo={setView}
          initialTab={
            view === "Leveranciers"
              ? "suppliers"
              : "customers"
          }
        />
      );
    }
if (view === "Documenten") {
  return (
    <DocumentsView
      context={context}
      organization={organization}
      onGo={setView}
    />
  );
}

    if (view === "Communicatie") {
      return (
        <CommunicationView
          context={context}
        />
      );
    }
    if (
      view === "Factuurdetail"
    ) {
      const raw =
        typeof window !==
        "undefined"
          ? sessionStorage.getItem(
              "customer-receivable-detail",
            )
          : null;

      if (!raw) {
        return (
          <section className="card">
            <h2>
              Factuur niet gevonden
            </h2>

            <p>
              Selecteer opnieuw een
              verkoopfactuur.
            </p>

            <button
              type="button"
              className="btn"
              onClick={() =>
                setView(
                  "Klanten",
                )
              }
            >
              Terug naar facturen
            </button>
          </section>
        );
      }

      try {
        const item =
          JSON.parse(raw);

        return (
          <InvoiceDetailView
            kind="receivable"
            item={item}
            onBack={() =>
              setView(
                "Klanten",
              )
            }
          />
        );
      } catch {
        return (
          <section className="card">
            <h2>
              Factuur niet gevonden
            </h2>

            <p>
              De factuurgegevens
              konden niet worden
              gelezen.
            </p>

            <button
              type="button"
              className="btn"
              onClick={() =>
                setView(
                  "Klanten",
                )
              }
            >
              Terug naar facturen
            </button>
          </section>
        );
      }
    }

    if (
      view ===
      "Inkoopfactuurdetail"
    ) {
      const raw =
        typeof window !==
        "undefined"
          ? sessionStorage.getItem(
              "customer-payable-detail",
            )
          : null;

      if (!raw) {
        return (
          <section className="card">
            <h2>
              Factuur niet gevonden
            </h2>

            <p>
              Selecteer opnieuw een
              inkoopfactuur.
            </p>

            <button
              type="button"
              className="btn"
              onClick={() =>
                setView(
                  "Leveranciers",
                )
              }
            >
              Terug naar
              leveranciers
            </button>
          </section>
        );
      }

      try {
        const item =
          JSON.parse(raw);

        return (
          <InvoiceDetailView
            kind="payable"
            item={item}
            onBack={() =>
              setView(
                "Leveranciers",
              )
            }
          />
        );
      } catch {
        return (
          <section className="card">
            <h2>
              Factuur niet gevonden
            </h2>

            <p>
              De factuurgegevens
              konden niet worden
              gelezen.
            </p>

            <button
              type="button"
              className="btn"
              onClick={() =>
                setView(
                  "Leveranciers",
                )
              }
            >
              Terug naar
              leveranciers
            </button>
          </section>
        );
      }
    }

    if (
      view === "Afspraken"
    ) {
      return (
        <AppointmentsView
          context={context}
        />
      );
    }

    if (
      view === "Bedrijfsmiddelen"
    ) {
      return (
        <InventoryView
          context={context}
          organization={organization}
        />
      );
    }

    if (
      view === "Instellingen"
    ) {
      return (
        <>
          <div className="heading">
            <div>
              <h1>
                Instellingen
              </h1>

              <p>
                Beheer uw profiel en
                beveiligingsinstellingen.
              </p>
            </div>
          </div>

          <section className="card">
            <h2>Uw profiel</h2>

            <div className="customer-status-list">
              <div>
                <span>Naam</span>

                <strong>
                  {
                    context.profile
                      .display_name
                  }
                </strong>
              </div>

              <div>
                <span>
                  E-mailadres
                </span>

                <strong>
                  {
                    context.profile
                      .email
                  }
                </strong>
              </div>

              <div>
                <span>
                  Accountstatus
                </span>

                <strong>
                  Actief
                </strong>
              </div>

              <div>
                <span>
                  Ondernemingen
                </span>

                <strong>
                  {
                    context
                      .memberships
                      .length
                  }{" "}
                  actieve koppeling
                  {context
                    .memberships
                    .length === 1
                    ? ""
                    : "en"}
                </strong>
              </div>
            </div>

            <div className="notice">
              Profielwijzigingen,
              uitnodigingen en
              gebruikersbeheer zijn
              nog niet beschikbaar in
              het klantportaal.
            </div>

            <PasskeySettings />
          </section>
        </>
      );
    }

    return (
      <>
        <div className="heading">
          <div>
            <h1>{view}</h1>

            <p>
              {organization?.name ??
                "Alle toegankelijke ondernemingen"}
            </p>
          </div>
        </div>

        <section className="card">
          <h2>{view}</h2>

          <p>
            Dit onderdeel wordt
            momenteel aangesloten op
            de nieuwe
            administratieomgeving.
          </p>

          <p>
            Er worden geen
            demogegevens getoond.
            Zodra deze module veilig
            met de echte
            administratiegegevens is
            verbonden, verschijnt de
            informatie hier
            automatisch.
          </p>
        </section>
      </>
    );
  }

  const initials =
    context.profile.display_name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div
      className={
        sidebarCollapsed
          ? "shell portal-sidebar-collapsed"
          : "shell"
      }
    >
      <aside className="sidebar">
        <div className="brand bestemd-portal-brand">
          <div className="portal-brand-assets">
            <img
              src="/mijn-bestemming-logo.png"
              alt="Mijn Bestemming"
              className="portal-brand-logo"
            />

            <img
              src="/icon.png"
              alt=""
              aria-hidden="true"
              className="portal-brand-icon"
            />
          </div>

          <button
            type="button"
            className="portal-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={
              sidebarCollapsed
                ? "Menu uitklappen"
                : "Menu inklappen"
            }
            title={
              sidebarCollapsed
                ? "Menu uitklappen"
                : "Menu inklappen"
            }
          >
            {sidebarCollapsed
              ? <ChevronRight />
              : <ChevronLeft />}
          </button>
        </div>

        <nav
          className="nav portal-grouped-nav"
          aria-label="Hoofdnavigatie"
        >
          {businessNav.map(
            ([label, Icon]) => (
              <button
                key={label}
                className={
                  view === label ||
                  (
                    label === "Relaties" &&
                    (
                      view === "Klanten" ||
                      view === "Leveranciers"
                    )
                  )
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setView(label)
                }
              >
                <Icon />

                <span>
                  {label}
                </span>
              </button>
            ),
          )}
        </nav>

      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            {switcher || (
              <strong>
                {organization?.name ||
                  context
                    .organizations[0]
                    ?.name ||
                  "Mijn onderneming"}
              </strong>
            )}
          </div>

          <div className="topbar-actions">
            <InstallApp placement="header" />

            <div className="profile">
              <div className="avatar">
                {initials}
              </div>

              <div className="profile-text">
                <strong>
                  {
                    context.profile
                      .display_name
                  }
                </strong>

                <small>
                  {organization?.name ??
                    (context.organizationId ===
                    "all"
                      ? "Alle ondernemingen"
                      : "Mijn onderneming")}
                </small>
              </div>

              <Logout />
            </div>
          </div>
        </header>

        <div className="content">
          {error && (
            <p
              className="notice"
              role="alert"
            >
              {error}
            </p>
          )}

          {renderView()}
        </div>
      </main>

      <nav
        className="mobile-nav"
        aria-label="Mobiele navigatie"
      >
        {nav
          .slice(0, 2)
          .map(
            ([label, Icon]) => (
              <button
                key={label}
                type="button"
                className={
                  view === label
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setView(label);
                  setMobileMoreOpen(false);
                  setMobileUploadOpen(false);
                }}
              >
                <Icon />

                <span>
                  {label}
                </span>
              </button>
            ),
          )}

        <button
          type="button"
          className="mobile-upload-fab"
          onClick={() => {
            setMobileUploadOpen(
              true,
            );
            setMobileMoreOpen(
              false,
            );
          }}
          aria-label="Document toevoegen"
        >
          <span className="mobile-upload-fab-circle">
            <Plus />
          </span>

          <span className="mobile-upload-fab-label">
            Upload
          </span>
        </button>

        {nav
          .slice(2, 3)
          .map(
            ([label, Icon]) => (
              <button
                key={label}
                type="button"
                className={
                  view === label
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setView(label);
                  setMobileMoreOpen(false);
                  setMobileUploadOpen(false);
                }}
              >
                <Icon />

                <span>
                  {label}
                </span>
              </button>
            ),
          )}

        <button
          type="button"
          className={
            mobileMoreOpen
              ? "active"
              : ""
          }
          onClick={() => {
            setMobileMoreOpen(
              (open) => !open,
            );

            setMobileUploadOpen(
              false,
            );
          }}
          aria-expanded={
            mobileMoreOpen
          }
        >
          <MoreHorizontal />

          <span>Meer</span>
        </button>
      </nav>

      {mobileUploadOpen && (
        <div
          className="mobile-more-backdrop mobile-upload-backdrop"
          onClick={() =>
            setMobileUploadOpen(
              false,
            )
          }
        >
          <section
            className="mobile-upload-sheet"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="mobile-more-head">
              <div>
                <strong>
                  Document toevoegen
                </strong>

                <small>
                  Bon, factuur of ander document
                </small>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMobileUploadOpen(
                    false,
                  )
                }
                aria-label="Uploadmenu sluiten"
              >
                ×
              </button>
            </div>

            <div className="mobile-upload-options">
              <button
                type="button"
                disabled={
                  mobileUploading
                }
                onClick={() =>
                  cameraInputRef.current?.click()
                }
              >
                <span className="mobile-upload-option-icon">
                  <Camera />
                </span>

                <span>
                  <strong>
                    Foto maken
                  </strong>

                  <small>
                    Gebruik de camera
                  </small>
                </span>
              </button>

              <button
                type="button"
                disabled={
                  mobileUploading
                }
                onClick={() =>
                  galleryInputRef.current?.click()
                }
              >
                <span className="mobile-upload-option-icon">
                  <Image />
                </span>

                <span>
                  <strong>
                    Fotogalerij
                  </strong>

                  <small>
                    Kies een bestaande foto
                  </small>
                </span>
              </button>

              <button
                type="button"
                disabled={
                  mobileUploading
                }
                onClick={() =>
                  fileUploadInputRef.current?.click()
                }
              >
                <span className="mobile-upload-option-icon">
                  <FileUp />
                </span>

                <span>
                  <strong>
                    Bestand uploaden
                  </strong>

                  <small>
                    PDF, JPG of PNG
                  </small>
                </span>
              </button>
            </div>

            {mobileUploading && (
              <div className="mobile-upload-progress">
                Document wordt veilig geüpload...
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                const file =
                  event.target.files?.[0];

                if (file) {
                  void uploadMobileDocument(
                    file,
                  );
                }
              }}
            />

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(event) => {
                const file =
                  event.target.files?.[0];

                if (file) {
                  void uploadMobileDocument(
                    file,
                  );
                }
              }}
            />

            <input
              ref={fileUploadInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              hidden
              onChange={(event) => {
                const file =
                  event.target.files?.[0];

                if (file) {
                  void uploadMobileDocument(
                    file,
                  );
                }
              }}
            />
          </section>
        </div>
      )}

      {mobileMoreOpen && (
        <div
          className="mobile-more-backdrop"
          onClick={() =>
            setMobileMoreOpen(false)
          }
        >
          <section
            className="mobile-more-sheet"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="mobile-more-head">
              <div>
                <strong>
                  Alle onderdelen
                </strong>

                <small>
                  Mijn Onderneming
                </small>
              </div>

              <button
                type="button"
                onClick={() =>
                  setMobileMoreOpen(
                    false,
                  )
                }
                aria-label="Menu sluiten"
              >
                ×
              </button>
            </div>

            <div className="mobile-more-grid">
              {nav
                .slice(3)
                .map(
                  ([label, Icon]) => (
                    <button
                      type="button"
                      key={label}
                      className={
                        view === label
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        setView(label);
                        setMobileMoreOpen(
                          false,
                        );
                      }}
                    >
                      <span className="mobile-more-icon">
                        <Icon />
                      </span>

                      <span>
                        {label}
                      </span>
                    </button>
                  ),
                )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}