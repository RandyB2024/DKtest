"use client";

import {
  Compass,
  FileText,
  PiggyBank,
  ShieldCheck,
  Target,
} from "lucide-react";

import Logout from "./logout";


type Props = {
  displayName: string;
};


export default function PersonalPortal({
  displayName,
}: Props) {
  return (
    <main className="personal-shell">

      <header className="personal-topbar">

        <div>
          <span className="personal-area-label">
            Mijn Bestemming
          </span>

          <strong>
            {displayName}
          </strong>
        </div>

        <Logout />

      </header>


      <div className="personal-content">

        <section className="personal-welcome">

          <span className="personal-area-label">
            PERSOONLIJK
          </span>

          <h1>
            Welkom bij Mijn Bestemming
          </h1>

          <p>
            Deze omgeving staat volledig los
            van uw zakelijke administratie.
          </p>

        </section>


        <section className="personal-start-grid">

          <article className="personal-start-card">
            <Target />

            <h2>
              Mijn levensplan
            </h2>

            <p>
              Persoonlijke doelen,
              wensen en toekomstplanning.
            </p>
          </article>


          <article className="personal-start-card">
            <Compass />

            <h2>
              Lifecoaching
            </h2>

            <p>
              Gesprekken, aandachtspunten
              en persoonlijke ontwikkeling.
            </p>
          </article>


          <article className="personal-start-card">
            <PiggyBank />

            <h2>
              Mijn ABC
            </h2>

            <p>
              Evenwicht, buffers en
              creatie van financiële waarde.
            </p>
          </article>


          <article className="personal-start-card">
            <FileText />

            <h2>
              Inkomstenbelasting
            </h2>

            <p>
              Uw persoonlijke aangifte,
              status en documenten.
            </p>
          </article>

        </section>


        <section className="personal-security-note">
          <ShieldCheck />

          <div>
            <strong>
              Persoonlijke omgeving
            </strong>

            <p>
              Medewerkers of assistenten met
              toegang tot Mijn Onderneming krijgen
              hierdoor geen toegang tot uw
              persoonlijke gegevens.
            </p>
          </div>
        </section>

      </div>

    </main>
  );
}
