"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Landmark,
  Users,
} from "lucide-react";

import type {
  PortalContext,
  PortalOrganization,
} from "@/lib/portal-access";

import ReceivablesView from "./receivables-view";
import PayablesView from "./payables-view";


type RelationTab =
  | "customers"
  | "suppliers";


export default function RelationsView({
  context,
  organization,
  onGo,
  initialTab = "customers",
}: {
  context: PortalContext;
  organization?: PortalOrganization;
  onGo: (view: string) => void;
  initialTab?: RelationTab;
}) {
  const [
    tab,
    setTab,
  ] =
    useState<RelationTab>(
      initialTab,
    );


  useEffect(() => {
    setTab(
      initialTab,
    );
  }, [
    initialTab,
  ]);


  return (
    <div className="relations-view">

      <div
        className="relations-tabs"
        role="tablist"
        aria-label="Relaties"
      >

        <button
          type="button"
          role="tab"
          aria-selected={
            tab === "customers"
          }
          className={
            tab === "customers"
              ? "active"
              : ""
          }
          onClick={() =>
            setTab(
              "customers",
            )
          }
        >
          <Users size={17} />
          Klanten
        </button>


        <button
          type="button"
          role="tab"
          aria-selected={
            tab === "suppliers"
          }
          className={
            tab === "suppliers"
              ? "active"
              : ""
          }
          onClick={() =>
            setTab(
              "suppliers",
            )
          }
        >
          <Landmark size={17} />
          Leveranciers
        </button>

      </div>


      {tab === "customers" ? (
        <ReceivablesView
          context={context}
          organization={organization}
          onGo={onGo}
        />
      ) : (
        <PayablesView
          context={context}
          organization={organization}
          onGo={onGo}
        />
      )}

    </div>
  );
}
