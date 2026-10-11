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

      <div
        className="bestemd-choice-decoration bestemd-choice-decoration--left"
        aria-hidden="true"
      />

      <div
        className="bestemd-choice-decoration bestemd-choice-decoration--right"
        aria-hidden="true"
      />


      <section className="bestemd-choice-content">

        <header className="bestemd-choice-hero">

          <img
            src="/mijn-bestemming-logo.png"
            alt="Mijn Bestemming"
            className="bestemd-choice-logo"
          />

          <div className="bestemd-choice-title">

            <h1>
              Waar wilt u naartoe?
            </h1>

            <p>
              Kies de omgeving die het beste past
              bij uw doel en situatie.
            </p>

          </div>

        </header>


        <section
          className="bestemd-choice-grid"
          aria-label="Kies uw Bestemd omgeving"
        >

          <a
            href="/mijn-bestemming"
            className="bestemd-choice-card"
          >

            <div
              className="bestemd-choice-card-wave"
              aria-hidden="true"
            />

            <div className="bestemd-choice-card-top">

              <span className="bestemd-choice-icon">
                <Compass />
              </span>


              <div className="bestemd-choice-card-title">

                <span className="bestemd-choice-label">
                  Persoonlijk
                </span>

                <h2>
                  Mijn Bestemming
                </h2>

              </div>

            </div>


            <p className="bestemd-choice-description">
              Uw persoonlijke omgeving voor
              levensplanning, Mijn ABC,
              inkomstenbelasting, vermogen,
              coaching en persoonlijke documenten.
            </p>


            <span className="bestemd-choice-action">

              <span>
                Persoonlijk inloggen
              </span>

              <ArrowRight />

            </span>

          </a>


          <a
            href="/mijn-onderneming"
            className="bestemd-choice-card"
          >

            <div
              className="bestemd-choice-card-wave"
              aria-hidden="true"
            />

            <div className="bestemd-choice-card-top">

              <span className="bestemd-choice-icon">
                <BriefcaseBusiness />
              </span>


              <div className="bestemd-choice-card-title">

                <span className="bestemd-choice-label">
                  Zakelijk
                </span>

                <h2>
                  Mijn Onderneming
                </h2>

              </div>

            </div>


            <p className="bestemd-choice-description">
              Uw zakelijke omgeving voor
              administratie, bankieren, facturatie,
              documenten, belastingen, rapportages
              en communicatie.
            </p>


            <span className="bestemd-choice-action">

              <span>
                Zakelijk inloggen
              </span>

              <ArrowRight />

            </span>

          </a>

        </section>


        <footer className="bestemd-choice-footer">

          <span
            className="bestemd-choice-footer-line"
            aria-hidden="true"
          />

          <span className="bestemd-choice-footer-security">
            <ShieldCheck />

            Beveiligd met tweestapsverificatie
          </span>

          <span
            className="bestemd-choice-footer-line"
            aria-hidden="true"
          />

        </footer>

      </section>

    </main>
  );
}
