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
  const [
    view,
    setView,
  ] =
    useState<View>(
      "Overzicht",
    );


  function renderOverview() {
    return (
      <>
        <section className="personal-welcome">

          <span className="personal-area-label">
            MIJN BESTEMMING
          </span>

          <h1>
            Welkom, {displayName}
          </h1>

          <p>
            Uw persoonlijke omgeving voor
            levensplanning, financiële rust
            en uw toekomstige bestemming.
          </p>

        </section>


        <section className="personal-start-grid">

          <button
            type="button"
            className="personal-start-card"
            onClick={() =>
              setView(
                "Mijn levensplan",
              )
            }
          >
            <Target />

            <span>
              <h2>
                Mijn levensplan
              </h2>

              <p>
                Waar staat u nu,
                waar wilt u naartoe
                en wat is daarvoor nodig?
              </p>
            </span>
          </button>


          <button
            type="button"
            className="personal-start-card"
            onClick={() =>
              setView(
                "Lifecoaching",
              )
            }
          >
            <HeartHandshake />

            <span>
              <h2>
                Lifecoaching
              </h2>

              <p>
                Persoonlijke gesprekken,
                aandachtspunten en
                ontwikkeling.
              </p>
            </span>
          </button>


          <button
            type="button"
            className="personal-start-card"
            onClick={() =>
              setView(
                "Mijn ABC",
              )
            }
          >
            <Compass />

            <span>
              <h2>
                Mijn ABC
              </h2>

              <p>
                A voor evenwicht,
                B voor buffers en
                C voor creatie.
              </p>
            </span>
          </button>


          <button
            type="button"
            className="personal-start-card"
            onClick={() =>
              setView(
                "Mijn vermogen",
              )
            }
          >
            <PiggyBank />

            <span>
              <h2>
                Mijn vermogen
              </h2>

              <p>
                Persoonlijk inzicht in
                bezit, verplichtingen
                en vermogensontwikkeling.
              </p>
            </span>
          </button>


          <button
            type="button"
            className="personal-start-card"
            onClick={() =>
              setView(
                "Mijn verzekeringen",
              )
            }
          >
            <Umbrella />

            <span>
              <h2>
                Mijn verzekeringen
              </h2>

              <p>
                Uw persoonlijke
                verzekeringen en
                belangrijke aandachtspunten.
              </p>
            </span>
          </button>


          <button
            type="button"
            className="personal-start-card"
            onClick={() =>
              setView(
                "Inkomstenbelasting",
              )
            }
          >
            <ClipboardCheck />

            <span>
              <h2>
                Inkomstenbelasting
              </h2>

              <p>
                Status van uw persoonlijke
                aangifte en wat er nog
                nodig is.
              </p>
            </span>
          </button>


          <button
            type="button"
            className="personal-start-card"
            onClick={() =>
              setView(
                "Mijn documenten",
              )
            }
          >
            <FileText />

            <span>
              <h2>
                Mijn documenten
              </h2>

              <p>
                Persoonlijke stukken zoals
                fiscale documenten,
                aktes en belangrijke
                overeenkomsten.
              </p>
            </span>
          </button>

        </section>


        <section className="personal-security-note">

          <ShieldCheck />

          <div>
            <strong>
              Persoonlijk en afgescheiden
            </strong>

            <p>
              Deze omgeving staat los van
              Mijn Onderneming. Zakelijke
              medewerkers of assistenten
              krijgen hierdoor geen toegang
              tot uw persoonlijke gegevens.
            </p>
          </div>

        </section>
      </>
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
        "Hier wordt uw persoonlijke financiële planning opgebouwd rond A: evenwicht, B: buffers en C: creatie van waarde.";
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
        "Hier komt uw persoonlijke verzekeringsoverzicht en de koppeling met advies via Bestemd en Klaas Vis.";
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
              vermengen met uw persoonlijke
              omgeving.
            </p>
          </div>

        </article>

      </section>
    );
  }


  return (
    <div className="personal-app-shell">

      <aside className="personal-sidebar">

        <div className="personal-sidebar-brand">

          <img
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


      <main className="personal-app-main">

        <header className="personal-topbar">

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
                : renderPlaceholder(
                    view,
                  )}

        </div>

      </main>

    </div>
  );
}
