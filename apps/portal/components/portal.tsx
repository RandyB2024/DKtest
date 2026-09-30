"use client";

import { useState } from "react";

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

const nav = [
  ["Dashboard", LayoutDashboard],
  ["Bankieren", WalletCards],
  ["Facturen", FileText],
  ["Crediteuren", Landmark],
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

    if (view === "Facturen") {
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

    if (view === "Crediteuren") {
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
                  "Facturen",
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
                "Facturen",
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
                  "Facturen",
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
                  "Crediteuren",
                )
              }
            >
              Terug naar
              crediteuren
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
                "Crediteuren",
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
                  "Crediteuren",
                )
              }
            >
              Terug naar
              crediteuren
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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">
            DK
          </span>

          <div>
            <strong>
              Mijn Destination Known
            </strong>

            <small>
              {
                context.profile
                  .display_name
              }
            </small>
          </div>
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

        <button
          className={
            view === "Instellingen"
              ? "active"
              : ""
          }
          onClick={() =>
            setView(
              "Instellingen",
            )
          }
        >
          <Settings />

          <span>Profiel</span>
        </button>
      </nav>
    </div>
  );
}