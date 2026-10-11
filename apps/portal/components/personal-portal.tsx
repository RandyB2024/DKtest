"use client";

import {
  useState,
} from "react";

import {
  ClipboardCheck,
  Compass,
  FileText,
  FolderOpen,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  ShieldCheck,
  Target,
  Umbrella,
  WalletCards,
} from "lucide-react";

import Logout from "./logout";
import PersonalLifePlan from "./personal-life-plan";
import PersonalCoaching from "./personal-coaching";
import { PersonalDocumentsView } from "./personal-documents-view";


const personalNav = [
  [
    "Overzicht",
    LayoutDashboard,
  ],
  [
    "Mijn levensplan",
    Target,
  ],
  [
    "Lifecoaching",
    HeartHandshake,
  ],
  [
    "Mijn ABC",
    Compass,
  ],
  [
    "Mijn vermogen",
    PiggyBank,
  ],
  [
    "Mijn verzekeringen",
    Umbrella,
  ],
  [
    "Inkomstenbelasting",
    ClipboardCheck,
  ],
  [
    "Mijn documenten",
    FolderOpen,
  ],
] as const;


type View =
  typeof personalNav[number][0];


type Props = {
  displayName: string;
};


export default function PersonalPortal({
  displayName,
}: Props) {
  const [personalMobileMenuOpen, setPersonalMobileMenuOpen] = useState(false);

  const [personalSidebarCollapsed, setPersonalSidebarCollapsed] = useState(false);

  const [
    view,
    setView,
  ] =
    useState<View>(
      "Overzicht",
    );


  function renderOverview() {
    return (
      <div className="personal-dashboard">

        <section className="personal-dashboard-hero">

          <div className="personal-dashboard-hero-copy">

            <span className="personal-area-label">
              MIJN BESTEMMING
            </span>

            <h1>
              Welkom, {displayName}
            </h1>

            <p>
              Jouw persoonlijke omgeving voor rust,
              overzicht en richting. Alles wat
              belangrijk is voor jouw bestemming
              staat hier bij elkaar.
            </p>

          </div>


          <div className="personal-dashboard-hero-brand">

            <div className="personal-brand-tile">
              <img
                src="/mijn-bestemming-logo.png"
                alt="Mijn Bestemming"
              />
            </div>

          </div>

        </section>


        <section className="personal-dashboard-grid">

          <button
            type="button"
            className="personal-dashboard-card"
            onClick={() =>
              setView("Mijn levensplan")
            }
          >
            <div className="personal-dashboard-card-icon">
              <Target />
            </div>

            <div>
              <span className="personal-dashboard-card-label">
                Richting
              </span>

              <h2>
                Mijn levensplan
              </h2>

              <p>
                Waar sta jij nu, waar wil jij naartoe
                en welke stappen horen daarbij?
              </p>
            </div>
          </button>


          <button
            type="button"
            className="personal-dashboard-card"
            onClick={() =>
              setView("Lifecoaching")
            }
          >
            <div className="personal-dashboard-card-icon">
              <HeartHandshake />
            </div>

            <div>
              <span className="personal-dashboard-card-label">
                Ontwikkeling
              </span>

              <h2>
                Lifecoaching
              </h2>

              <p>
                Persoonlijke gesprekken,
                reflectie en jouw volgende stap.
              </p>
            </div>
          </button>


          <button
            type="button"
            className="personal-dashboard-card"
            onClick={() =>
              setView("Mijn ABC")
            }
          >
            <div className="personal-dashboard-card-icon">
              <Compass />
            </div>

            <div>
              <span className="personal-dashboard-card-label">
                Financiële basis
              </span>

              <h2>
                Mijn ABC
              </h2>

              <p>
                Inzicht in evenwicht, buffers
                en waardecreatie.
              </p>
            </div>
          </button>


          <button
            type="button"
            className="personal-dashboard-card"
            onClick={() =>
              setView("Mijn vermogen")
            }
          >
            <div className="personal-dashboard-card-icon">
              <PiggyBank />
            </div>

            <div>
              <span className="personal-dashboard-card-label">
                Vermogen
              </span>

              <h2>
                Mijn vermogen
              </h2>

              <p>
                Overzicht van bezit,
                verplichtingen en ontwikkeling.
              </p>
            </div>
          </button>


          <button
            type="button"
            className="personal-dashboard-card"
            onClick={() =>
              setView("Mijn verzekeringen")
            }
          >
            <div className="personal-dashboard-card-icon">
              <Umbrella />
            </div>

            <div>
              <span className="personal-dashboard-card-label">
                Zekerheid
              </span>

              <h2>
                Mijn verzekeringen
              </h2>

              <p>
                Persoonlijke verzekeringen
                en belangrijke aandachtspunten.
              </p>
            </div>
          </button>


          <button
            type="button"
            className="personal-dashboard-card"
            onClick={() =>
              setView("Inkomstenbelasting")
            }
          >
            <div className="personal-dashboard-card-icon">
              <ClipboardCheck />
            </div>

            <div>
              <span className="personal-dashboard-card-label">
                Belasting
              </span>

              <h2>
                Inkomstenbelasting
              </h2>

              <p>
                Status van jouw aangifte
                en wat er nog nodig is.
              </p>
            </div>
          </button>


          <button
            type="button"
            className="personal-dashboard-card personal-dashboard-card-wide"
            onClick={() =>
              setView("Mijn documenten")
            }
          >
            <div className="personal-dashboard-card-icon">
              <FolderOpen />
            </div>

            <div>
              <span className="personal-dashboard-card-label">
                Documenten
              </span>

              <h2>
                Mijn documenten
              </h2>

              <p>
                Nieuwe documenten in jouw inbox.
                Verwerkte documenten worden
                automatisch in het juiste archief gezet.
              </p>
            </div>
          </button>

        </section>


        <section className="personal-dashboard-security">

          <ShieldCheck />

          <div>
            <strong>
              Persoonlijk en afgescheiden
            </strong>

            <p>
              Mijn Bestemming staat los van
              Mijn Onderneming. Zakelijke medewerkers
              krijgen geen toegang tot jouw
              persoonlijke gegevens.
            </p>
          </div>

        </section>

      </div>
    );
  }


  function renderPlaceholder(
    title: View,
  ) {
    let description =
      "Dit persoonlijke onderdeel wordt in de volgende ontwikkelfase aangesloten.";

    if (
      title ===
      "Mijn levensplan"
    ) {
      description =
        "Hier bouwen we het persoonlijke levensplan met doelen, wensen, belangrijke levensmomenten en jaarlijkse updates.";
    }

    if (
      title ===
      "Lifecoaching"
    ) {
      description =
        "Hier komen coachinggesprekken, afspraken, persoonlijke aandachtspunten en voortgang.";
    }

    if (
      title ===
      "Mijn ABC"
    ) {
      description =
        "Hier wordt jouw persoonlijke financiële planning opgebouwd rond A: evenwicht, B: buffers en C: creatie van waarde.";
    }

    if (
      title ===
      "Mijn vermogen"
    ) {
      description =
        "Hier komt het persoonlijke vermogensoverzicht met bezit, schulden en ontwikkeling door de tijd.";
    }

    if (
      title ===
      "Mijn verzekeringen"
    ) {
      description =
        "Hier komt jouw persoonlijke verzekeringsoverzicht en de koppeling met advies via Bestemd en Klaas Vis.";
    }

    if (
      title ===
      "Inkomstenbelasting"
    ) {
      description =
        "Hier komt de persoonlijke IB-workflow met documenten, status, akkoord en uiteindelijke verwerking.";
    }

    if (
      title ===
      "Mijn documenten"
    ) {
      description =
        "Hier komt het persoonlijke archief voor belangrijke privé-documenten, volledig gescheiden van de documenten van ondernemingen.";
    }


    return (
      <section className="personal-module-page">

        <div className="personal-module-heading">

          <span className="personal-area-label">
            MIJN BESTEMMING
          </span>

          <h1>
            {title}
          </h1>

          <p>
            {description}
          </p>

        </div>


        <article className="personal-module-empty">

          <div className="personal-module-empty-icon">
            <Compass />
          </div>

          <div>
            <h2>
              Dit onderdeel wordt voorbereid
            </h2>

            <p>
              De toegang en afscherming zijn
              al actief. De inhoud wordt nu
              stap voor stap toegevoegd zonder
              de zakelijke administratie te
              vermengen met jouw persoonlijke
              omgeving.
            </p>
          </div>

        </article>

      </section>
    );
  }


  return (
    <div className="personal-app-shell">

      <aside className={`personal-sidebar${personalSidebarCollapsed ? " is-collapsed" : ""}${personalMobileMenuOpen ? " is-mobile-open" : ""}`}>

        <div className="personal-sidebar-brand">
          <button
            type="button"
            className="personal-sidebar-toggle"
            aria-label={personalSidebarCollapsed ? "Menubalk uitklappen" : "Menubalk inklappen"}
            aria-pressed={personalSidebarCollapsed}
            onClick={() =>
              setPersonalSidebarCollapsed(
                (current) => !current,
              )
            }
          >
            <span />
            <span />
            <span />
          </button>

          <img className="personal-sidebar-logo"
            src="/mijn-bestemming-logo.png"
            alt="Mijn Bestemming"
          />

          <span>
            Persoonlijk
          </span>

        </div>


        <nav
          className="personal-navigation"
          aria-label="Mijn Bestemming"
        >

          {personalNav.map(
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
                  setPersonalMobileMenuOpen(false);
                }}
              >
                <Icon />

                <span>
                  {label}
                </span>
              </button>
            ),
          )}

        </nav>


        <div className="personal-sidebar-footer">

          <a
            href="/"
            className="personal-switch-environment"
          >
            <WalletCards />

            <span>
              Andere omgeving
            </span>
          </a>

        </div>

      </aside>


      {personalMobileMenuOpen && (
        <button
          type="button"
          className="personal-mobile-overlay"
          aria-label="Menu sluiten"
          onClick={() =>
            setPersonalMobileMenuOpen(false)
          }
        />
      )}

      <main className="personal-app-main">

        <header className="personal-topbar">

          <button
            type="button"
            className="personal-mobile-menu-button"
            aria-label="Menu openen"
            onClick={() =>
              setPersonalMobileMenuOpen(true)
            }
          >
            <span />
            <span />
            <span />
          </button>

          <div>
            <span className="personal-area-label">
              Mijn Bestemming
            </span>

            <strong>
              {displayName}
            </strong>
          </div>


          <div className="personal-topbar-actions">

            <a
              href="/"
              className="btn"
            >
              Andere omgeving
            </a>

            <Logout />

          </div>

        </header>


        <div className="personal-content">

          {view === "Overzicht"
            ? renderOverview()
            : view === "Mijn levensplan"
              ? <PersonalLifePlan />
              : view === "Lifecoaching"
                ? <PersonalCoaching />
                : view === "Mijn documenten"
                  ? <PersonalDocumentsView />
                  : renderPlaceholder(
                    view,
                  )}

        </div>

      </main>

    </div>
  );
}
