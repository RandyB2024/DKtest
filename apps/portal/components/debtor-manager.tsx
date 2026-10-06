"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import type {
  PortalContext,
} from "@/lib/portal-access";

import InvoiceArchive from "./invoice-archive";


type Debtor = {
  id: string;
  name: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  kvkNumber: string | null;
  vatNumber: string | null;
  reference: string | null;
  paymentTermDays: number;
  address: {
    street?: string;
    houseNumber?: string;
    addition?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
};


type Props = {
  context: PortalContext;
};


type ApiResponse = {
  error?: string;
  debtors?: Debtor[];
  debtorId?: string;
};



const emptyForm = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  kvkNumber: "",
  vatNumber: "",
  reference: "",
  paymentTermDays: "30",
  street: "",
  houseNumber: "",
  addition: "",
  postalCode: "",
  city: "",
  country: "Nederland",
};


export default function DebtorManager({
  context,
}: Props) {
  const [debtors, setDebtors] =
    useState<Debtor[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [query, setQuery] =
    useState("");

  const [
    dossierDebtorId,
    setDossierDebtorId,
  ] =
    useState<string | null>(null);

  const [
    dossierDebtorName,
    setDossierDebtorName,
  ] =
    useState("");

  const [formOpen, setFormOpen] =
    useState(false);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [form, setForm] =
    useState(emptyForm);


  async function load() {
    if (
      context.organizationId ===
      "all"
    ) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/invoicing/debtors?organizationId=${encodeURIComponent(
            context.organizationId,
          )}`,
          {
            cache: "no-store",
          },
        );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
          "Debiteuren konden niet worden geladen.",
        );
      }

      setDebtors(
        result.debtors ?? [],
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Debiteuren konden niet worden geladen.",
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void load();
  }, [
    context.organizationId,
  ]);


  const visible =
    useMemo(() => {
      const search =
        query
          .trim()
          .toLowerCase();

      if (!search) {
        return debtors;
      }

      return debtors.filter(
        (debtor) =>
          debtor.name
            .toLowerCase()
            .includes(search) ||
          debtor.email
            .toLowerCase()
            .includes(search) ||
          (
            debtor.contactName ??
            ""
          )
            .toLowerCase()
            .includes(search),
      );
    }, [
      debtors,
      query,
    ]);


  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError("");
  }


  function openEdit(
    debtor: Debtor,
  ) {
    setEditingId(
      debtor.id,
    );

    setForm({
      name:
        debtor.name ?? "",

      contactName:
        debtor.contactName ?? "",

      email:
        debtor.email ?? "",

      phone:
        debtor.phone ?? "",

      kvkNumber:
        debtor.kvkNumber ?? "",

      vatNumber:
        debtor.vatNumber ?? "",

      reference:
        debtor.reference ?? "",

      paymentTermDays:
        String(
          debtor.paymentTermDays ??
          30,
        ),

      street:
        debtor.address?.street ??
        "",

      houseNumber:
        debtor.address
          ?.houseNumber ?? "",

      addition:
        debtor.address?.addition ??
        "",

      postalCode:
        debtor.address
          ?.postalCode ?? "",

      city:
        debtor.address?.city ??
        "",

      country:
        debtor.address?.country ??
        "Nederland",
    });

    setFormOpen(true);
    setError("");
  }


  function field(
    name: keyof typeof emptyForm,
    value: string,
  ) {
    setForm(
      (current) => ({
        ...current,
        [name]: value,
      }),
    );
  }


  async function save(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      context.organizationId ===
      "all"
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/invoicing/debtors",
          {
            method: "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                action:
                  editingId
                    ? "update"
                    : "create",

                organizationId:
                  context.organizationId,

                debtorId:
                  editingId,

                name:
                  form.name,

                contactName:
                  form.contactName,

                email:
                  form.email,

                phone:
                  form.phone,

                kvkNumber:
                  form.kvkNumber,

                vatNumber:
                  form.vatNumber,

                reference:
                  form.reference,

                paymentTermDays:
                  Number(
                    form.paymentTermDays,
                  ),

                address: {
                  street:
                    form.street,

                  houseNumber:
                    form.houseNumber,

                  addition:
                    form.addition,

                  postalCode:
                    form.postalCode,

                  city:
                    form.city,

                  country:
                    form.country,
                },
              }),
          },
        );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
          "Debiteur kon niet worden opgeslagen.",
        );
      }

      setFormOpen(false);
      setEditingId(null);

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Debiteur kon niet worden opgeslagen.",
      );
    } finally {
      setBusy(false);
    }
  }




  if (
    context.organizationId ===
    "all"
  ) {
    return (
      <section className="card">
        <div className="notice">
          Selecteer één onderneming
          om debiteuren te beheren.
        </div>
      </section>
    );
  }


  return (
    <section className="card debtor-manager">

      <div className="section-heading debtor-manager-head">
        <div>
          <h2>
            Debiteurenbeheer
          </h2>

          <p>
            Beheer de klanten aan wie
            je facturen verstuurt.
          </p>
        </div>

        <button
          type="button"
          className="btn primary"
          onClick={openNew}
        >
          <Plus size={16} />
          Debiteur toevoegen
        </button>
      </div>


      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}


      <div className="debtor-search">
        <Search size={16} />

        <input
          value={query}
          onChange={(event) =>
            setQuery(
              event.target.value,
            )
          }
          placeholder="Zoek op naam, contactpersoon of e-mail"
        />
      </div>


      {loading ? (
        <p>
          Debiteuren worden geladen...
        </p>
      ) : visible.length === 0 ? (
        <div className="debtor-empty">
          <Users />
          <strong>
            Nog geen debiteuren
          </strong>

          <span>
            Voeg je eerste debiteur toe
            om straks een factuur te kunnen maken.
          </span>
        </div>
      ) : (
        <div className="debtor-list">
          {visible.map(
            (debtor) => (
              <article
                className="debtor-row"
                key={debtor.id}
              >
                <div>
                  <strong>
                    {debtor.name}
                  </strong>

                  <span>
                    {debtor.contactName ||
                      "Geen contactpersoon"}
                    {" · "}
                    {debtor.email}
                  </span>
                </div>

                <div>
                  <small>
                    Betaaltermijn
                  </small>

                  <strong>
                    {
                      debtor.paymentTermDays
                    } dagen
                  </strong>
                </div>

                <div className="debtor-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      setDossierDebtorId(
                        debtor.id,
                      );

                      setDossierDebtorName(
                        debtor.name,
                      );
                    }}
                  >
                    Facturen
                  </button>

                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      openEdit(
                        debtor,
                      )
                    }
                  >
                    <Pencil size={14} />
                    Bewerken
                  </button>

                </div>
              </article>
            ),
          )}
        </div>
      )}


      {dossierDebtorId && (
        <div className="debtor-dossier">

          <div className="debtor-dossier-head">
            <div>
              <small>
                DEBITEURENDOSSIER
              </small>

              <h3>
                {dossierDebtorName}
              </h3>
            </div>

            <button
              type="button"
              className="btn"
              onClick={() => {
                setDossierDebtorId(
                  null,
                );

                setDossierDebtorName(
                  "",
                );
              }}
            >
              Sluiten
            </button>
          </div>

          <InvoiceArchive
            context={context}
            debtorId={
              dossierDebtorId
            }
            title="Factuurhistorie"
            description={`Alle definitieve facturen van ${dossierDebtorName}.`}
            compact
          />

        </div>
      )}


      {formOpen && (
        <div className="debtor-modal-backdrop">
          <div className="debtor-modal">

            <div className="debtor-modal-head">
              <div>
                <small>
                  FACTURATIE
                </small>

                <h2>
                  {editingId
                    ? "Debiteur bewerken"
                    : "Nieuwe debiteur"}
                </h2>
              </div>

              <button
                type="button"
                className="btn"
                onClick={() =>
                  setFormOpen(false)
                }
              >
                <X size={17} />
              </button>
            </div>


            <form
              onSubmit={save}
              className="debtor-form"
            >
              <label>
                Bedrijfsnaam *

                <input
                  required
                  maxLength={160}
                  value={form.name}
                  onChange={(event) =>
                    field(
                      "name",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Contactpersoon

                <input
                  maxLength={160}
                  value={
                    form.contactName
                  }
                  onChange={(event) =>
                    field(
                      "contactName",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                E-mailadres *

                <input
                  required
                  type="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(event) =>
                    field(
                      "email",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Telefoonnummer

                <input
                  maxLength={40}
                  value={form.phone}
                  onChange={(event) =>
                    field(
                      "phone",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                KvK-nummer

                <input
                  maxLength={20}
                  value={
                    form.kvkNumber
                  }
                  onChange={(event) =>
                    field(
                      "kvkNumber",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Btw-id

                <input
                  maxLength={40}
                  value={
                    form.vatNumber
                  }
                  onChange={(event) =>
                    field(
                      "vatNumber",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label className="debtor-form-wide">
                Referentie / klantnummer

                <input
                  maxLength={100}
                  value={
                    form.reference
                  }
                  onChange={(event) =>
                    field(
                      "reference",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Straat

                <input
                  maxLength={120}
                  value={form.street}
                  onChange={(event) =>
                    field(
                      "street",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Huisnummer

                <input
                  maxLength={20}
                  value={
                    form.houseNumber
                  }
                  onChange={(event) =>
                    field(
                      "houseNumber",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Toevoeging

                <input
                  maxLength={20}
                  value={
                    form.addition
                  }
                  onChange={(event) =>
                    field(
                      "addition",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Postcode

                <input
                  maxLength={20}
                  value={
                    form.postalCode
                  }
                  onChange={(event) =>
                    field(
                      "postalCode",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Plaats

                <input
                  maxLength={100}
                  value={form.city}
                  onChange={(event) =>
                    field(
                      "city",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Land

                <input
                  maxLength={80}
                  value={
                    form.country
                  }
                  onChange={(event) =>
                    field(
                      "country",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Betaaltermijn

                <select
                  value={
                    form.paymentTermDays
                  }
                  onChange={(event) =>
                    field(
                      "paymentTermDays",
                      event.target.value,
                    )
                  }
                >
                  <option value="7">
                    7 dagen
                  </option>

                  <option value="14">
                    14 dagen
                  </option>

                  <option value="30">
                    30 dagen
                  </option>

                  <option value="60">
                    60 dagen
                  </option>
                </select>
              </label>


              <div className="debtor-form-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    setFormOpen(false)
                  }
                >
                  Annuleren
                </button>

                <button
                  type="submit"
                  className="btn primary"
                  disabled={busy}
                >
                  {busy
                    ? "Opslaan..."
                    : editingId
                      ? "Wijzigingen opslaan"
                      : "Debiteur toevoegen"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </section>
  );
}
