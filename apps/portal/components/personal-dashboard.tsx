"use client";

import {
  ArrowRight,
  Compass,
  FileText,
  PiggyBank,
  ShieldCheck,
  Target,
  Waypoints,
} from "lucide-react";

type PersonalDashboardProps = {
  displayName: string;
  onGo: (view: string) => void;
};

const items = [
  {
    title: "Mijn levensplan",
    description:
      "Uw persoonlijke doelen, plannen en belangrijke financiële momenten.",
    view: "Mijn levensplan",
    icon: Target,
  },
  {
    title: "Mijn ABC",
    description:
      "Inzicht in evenwicht, buffers en de opbouw van financiële waarde.",
    view: "Mijn ABC",
    icon: Waypoints,
  },
  {
    title: "Mijn vermogen",
    description:
      "Overzicht van vermogen, bezittingen en financiële ontwikkeling.",
    view: "Mijn vermogen",
    icon: PiggyBank,
  },
  {
    title: "Inkomstenbelasting",
    description:
      "Status van uw aangifte en de benodigde persoonlijke documenten.",
    view: "Inkomstenbelasting",
    icon: FileText,
  },
  {
    title: "Mijn verzekeringen",
    description:
      "Overzicht van uw persoonlijke verzekeringen en aandachtspunten.",
    view: "Mijn verzekeringen",
    icon: ShieldCheck,
  },
  {
    title: "Mijn documenten",
    description:
      "Uw persoonlijke financiële, fiscale en overige documenten.",
    view: "Mijn documenten",
    icon: FileText,
  },
] as const;

export default function PersonalDashboard({
  displayName,
  onGo,
}: PersonalDashboardProps) {
  return (
    <div className="personal-dashboard">
      <section className="personal-hero">
        <div>
          <span className="personal-kicker">
            Mijn Bestemming
          </span>

          <h1>
            Goedendag, {displayName}
          </h1>

          <p>
            Niet alleen kijken naar wat er vandaag
            financieel gebeurt, maar naar waar u
            naartoe wilt.
          </p>
        </div>

        <div className="personal-hero-icon">
          <Compass />
        </div>
      </section>

      <section className="personal-module-grid">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.view}
              type="button"
              className="personal-module-card"
              onClick={() => onGo(item.view)}
            >
              <span className="personal-module-icon">
                <Icon />
              </span>

              <span className="personal-module-copy">
                <strong>
                  {item.title}
                </strong>

                <small>
                  {item.description}
                </small>
              </span>

              <ArrowRight />
            </button>
          );
        })}
      </section>

      <section className="personal-intro-card">
        <div>
          <span className="personal-kicker">
            Uw persoonlijke route
          </span>

          <h2>
            Van administratie naar bestemming
          </h2>

          <p>
            De administratie vormt de financiële
            basis. Binnen Mijn Bestemming worden
            deze gegevens later gekoppeld aan uw
            doelen, buffers, vermogen en plannen.
          </p>
        </div>
      </section>
    </div>
  );
}
