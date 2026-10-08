"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Bell,
  Building2,
  CalendarDays,
  Car,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  MessagesSquare,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Settings,
  Umbrella,
  WalletCards,
} from "lucide-react";

import type { PortalContext } from "@/lib/portal-access";

import BankingView from "./banking-view";
import CustomerDashboard from "./customer-dashboard";
import InstallApp from "./install-app";
import InvoiceDetailView from "./invoice-detail-view";
import Logout from "./logout";
import PasskeySettings from "./passkey-settings";
import PayablesView from "./payables-view";
import ReceivablesView from "./receivables-view";
import DocumentsView from "./documents-view";
import CommunicationView from "./communication-view";

const nav = [
  ["Dashboard", LayoutDashboard],
  ["Bankieren", WalletCards],
  ["Afnemers", FileText],
  ["Leveranciers", Landmark],
  ["Documenten", FolderOpen],
  ["Communicatie", MessagesSquare],
  ["Agenda", CalendarDays],
  ["Rapportages", ChartNoAxesCombined],
  ["Aangiften", ClipboardCheck],
  ["Voertuigen", Car],
  ["Verzekeringen", Umbrella],
  ["Notificaties", Bell],
  ["Bedrijfsprofiel", Building2],
  ["Instellingen", Settings],
] as const;

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

    if (view === "Afnemers") {
      return (
        <ReceivablesView
          context={context}
          organization={
            organization
          }
          onGo={setView}
        />
      );
    }

    if (view === "Leveranciers") {
      return (
        <PayablesView
          context={context}
          organization={
            organization
          }
          onGo={setView}
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
                  "Afnemers",
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
                "Afnemers",
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
                  "Afnemers",
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

    if (
      view ===
      "Bedrijfsprofiel"
    ) {
      return (
        <>
          <div className="heading">
            <div>
              <h1>
                Bedrijfsprofiel
              </h1>

              <p>
                Bekijk de
                ondernemingen die
                aan uw account zijn
                gekoppeld.
              </p>
            </div>
          </div>

          <section className="grid">
            {visibleOrganizations.map(
              (item) => (
                <article
                  className="card"
                  key={item.id}
                >
                  <h2>
                    {item.name}
                  </h2>

                  <div className="customer-status-list">
                    <div>
                      <span>
                        Juridische naam
                      </span>

                      <strong>
                        {item.legal_name ||
                          "Nog niet ingevuld"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        KvK-nummer
                      </span>

                      <strong>
                        {item.registration_number ||
                          "Nog niet ingevuld"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Status
                      </span>

                      <strong>
                        Actief
                      </strong>
                    </div>
                  </div>

                  {context.organizationId ===
                    "all" && (
                    <p>
                      <button
                        type="button"
                        className="btn"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          switchOrganization(
                            item.id,
                          )
                        }
                      >
                        Onderneming
                        openen
                      </button>
                    </p>
                  )}
                </article>
              ),
            )}
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
          className="nav"
          aria-label="Hoofdnavigatie"
        >
          {nav.map(
            ([label, Icon]) => (
              <button
                key={label}
                className={
                  view === label
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

        <div className="sidebar-foot">
          Beveiligd klantportaal
          <br />

          <strong>
            {context.aal2
              ? "Tweestapsverificatie bevestigd"
              : "Aangemeld"}
          </strong>
        </div>
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
          .slice(0, 4)
          .map(
            ([label, Icon]) => (
              <button
                key={label}
                className={
                  view === label
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setView(label);
                  setMobileMoreOpen(false);
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
          onClick={() =>
            setMobileMoreOpen(
              (open) => !open,
            )
          }
          aria-expanded={
            mobileMoreOpen
          }
        >
          <MoreHorizontal />

          <span>Meer</span>
        </button>
      </nav>

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
                  Mijn Bestemming
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
                .slice(4)
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