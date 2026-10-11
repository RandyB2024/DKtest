"use client";

import {
  ArrowRight,
  BriefcaseBusiness,
  Compass,
  ShieldCheck,
} from "lucide-react";

export default function AccessChoice() {
  return (
    <main className="bestemd-choice-page">

      <section className="bestemd-choice-header">
        <img
          src="/mijn-bestemming-logo.png"
          alt="Bestemd"
          className="bestemd-choice-logo"
        />

        <div>
          <span className="bestemd-choice-kicker">
            BESTEMD
          </span>

          <h1>
            Waar wilt u naartoe?
          </h1>

          <p>
            Kies de omgeving die bij uw doel past.
          </p>
        </div>
      </section>


      <section className="bestemd-choice-grid">

        <a
          href="/mijn-bestemming"
          className="bestemd-choice-card"
        >
          <span className="bestemd-choice-icon">
            <Compass />
          </span>

          <div>
            <span className="bestemd-choice-label">
              Persoonlijk
            </span>

            <h2>
              Mijn Bestemming
            </h2>

            <p>
              Uw persoonlijke omgeving voor
              levensplanning, Mijn ABC,
              inkomstenbelasting, vermogen,
              coaching en persoonlijke documenten.
            </p>

            <strong>
              Persoonlijk inloggen
              <ArrowRight />
            </strong>
          </div>
        </a>


        <a
          href="/mijn-onderneming"
          className="bestemd-choice-card"
        >
          <span className="bestemd-choice-icon">
            <BriefcaseBusiness />
          </span>

          <div>
            <span className="bestemd-choice-label">
              Zakelijk
            </span>

            <h2>
              Mijn Onderneming
            </h2>

            <p>
              Uw zakelijke omgeving voor
              administratie, bankieren,
              facturatie, documenten,
              belastingen, rapportages en
              communicatie.
            </p>

            <strong>
              Zakelijk inloggen
              <ArrowRight />
            </strong>
          </div>
        </a>

      </section>


      <footer className="bestemd-choice-footer">
        <ShieldCheck />
        Beveiligd met tweestapsverificatie
      </footer>

    </main>
  );
}
