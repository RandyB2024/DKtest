"use client";

import { ArrowRight, BriefcaseBusiness, Compass } from "lucide-react";

export default function AccessChoice() {
  return (
    <main className="bestemd-choice-page">
      <div className="bestemd-choice-decoration bestemd-choice-decoration--left" aria-hidden="true" />
      <div className="bestemd-choice-decoration bestemd-choice-decoration--right" aria-hidden="true" />

      <section className="bestemd-choice-content">
        <header className="bestemd-choice-hero">
          <img
            src="/mijn-bestemming-logo.png"
            alt="Mijn Bestemming"
            className="bestemd-choice-logo"
          />
          <div className="bestemd-choice-title">
            <h1>Waar wil jij naartoe?</h1>
            <p style={{ maxWidth: 750, margin: "12px auto 0", color: "#536b83", fontSize: "clamp(1rem, 1.4vw, 1.2rem)", lineHeight: 1.65, textAlign: "center" }}>
              Grip op je financiën, rust in je administratie en ruimte om te bouwen
              aan het leven en de onderneming die bij jou passen.
            </p>
          </div>
        </header>

        <section className="bestemd-choice-grid" aria-label="Kies jouw Bestemd omgeving">
          <a href="/mijn-bestemming" className="bestemd-choice-card">
            <div className="bestemd-choice-card-wave" aria-hidden="true" />
            <div className="bestemd-choice-card-top">
              <span className="bestemd-choice-icon"><Compass /></span>
              <div className="bestemd-choice-card-title">
                <span className="bestemd-choice-label">Persoonlijk</span>
                <h2>Mijn Bestemming</h2>
              </div>
            </div>
            <div className="bestemd-choice-benefits">
              <span>Levensplanning &amp; coaching</span>
              <span>Mijn ABC &amp; vermogen</span>
              <span>Inkomstenbelasting &amp; persoonlijke documenten</span>
            </div>
            <span className="bestemd-choice-action">
              <span>Persoonlijk inloggen</span>
              <ArrowRight />
            </span>
          </a>

          <a href="/mijn-onderneming" className="bestemd-choice-card">
            <div className="bestemd-choice-card-wave" aria-hidden="true" />
            <div className="bestemd-choice-card-top">
              <span className="bestemd-choice-icon"><BriefcaseBusiness /></span>
              <div className="bestemd-choice-card-title">
                <span className="bestemd-choice-label">Zakelijk</span>
                <h2>Mijn Onderneming</h2>
              </div>
            </div>
            <div className="bestemd-choice-benefits">
              <span>Administratie &amp; bankieren</span>
              <span>Facturatie &amp; documenten</span>
              <span>Belastingen, rapportages &amp; communicatie</span>
            </div>
            <span className="bestemd-choice-action">
              <span>Zakelijk inloggen</span>
              <ArrowRight />
            </span>
          </a>
        </section>

        <section aria-label="Onze missie en visie" style={{ maxWidth: 1000, margin: "clamp(28px, 4vw, 48px) auto 38px", padding: "0 20px", textAlign: "center" }}>
          <p style={{ margin: "0 0 12px", color: "#087d99", letterSpacing: "0.17em", textTransform: "uppercase", fontWeight: 700, fontSize: 12 }}>
            Rust &amp; vertrouwen
          </p>
          <h2 style={{ margin: "0 auto 16px", maxWidth: 820, color: "#0b3150", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "clamp(1.45rem, 2.4vw, 2.2rem)", lineHeight: 1.25 }}>
            Wij regelen en bewaken de financiële kant. Jij bepaalt de koers.
          </h2>
          <p style={{ margin: "0 auto", maxWidth: 820, color: "#536b83", lineHeight: 1.7, fontSize: "clamp(0.95rem, 1.2vw, 1.05rem)" }}>
            Onze missie is om MKB-ondernemers overzicht en grip op hun geld te geven.
            Onze visie gaat verder dan een kloppende administratie: financiële rust
            geeft ruimte om bewuste keuzes te maken en toe te werken naar het leven
            dat je écht wilt leiden. Daarom beginnen wij met de vraag: waar wil jij eigenlijk naartoe?
          </p>
        </section>
      </section>
    </main>
  );
}
