"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Building2,
  CheckCircle2,
  ImageUp,
  Save,
  Settings2,
  X,
} from "lucide-react";

import type {
  PortalContext,
} from "@/lib/portal-access";


type InvoiceProfile = {
  organizationId: string;
  companyName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  phone: string | null;
  website: string | null;

  businessAddress: {
    street?: string;
    houseNumber?: string;
    addition?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };

  iban: string | null;
  bic: string | null;
  invoiceEmail: string | null;
  footerText: string | null;
  logoStoragePath: string | null;
  defaultPaymentTermDays: number;
  invoicePrefix: string;
  creditPrefix: string;
  vatAccountingMethod: string;
};


type ApiResponse = {
  error?: string;
  profile?: InvoiceProfile;
  logoStoragePath?: string;
};


type Props = {
  context: PortalContext;
};


const emptyForm = {
  companyName: "",
  registrationNumber: "",
  vatNumber: "",
  phone: "",
  website: "",
  street: "",
  houseNumber: "",
  addition: "",
  postalCode: "",
  city: "",
  country: "Nederland",
  iban: "",
  bic: "",
  invoiceEmail: "",
  footerText: "",
  defaultPaymentTermDays: "30",
  invoicePrefix: "F",
  creditPrefix: "C",
};


export default function InvoiceProfileManager({
  context,
}: Props) {
  const [form, setForm] =
    useState(emptyForm);

  const [
    logoStoragePath,
    setLogoStoragePath,
  ] =
    useState<string | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    editing,
    setEditing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");


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
          `/api/invoicing/profile?organizationId=${encodeURIComponent(
            context.organizationId,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
          "Factuurprofiel kon niet worden geladen.",
        );
      }

      const profile =
        result.profile;

      if (!profile) {
        setEditing(true);
        return;
      }

      setLogoStoragePath(
        profile.logoStoragePath,
      );

      setForm({
        companyName:
          profile.companyName ??
          "",

        registrationNumber:
          profile.registrationNumber ??
          "",

        vatNumber:
          profile.vatNumber ??
          "",

        phone:
          profile.phone ??
          "",

        website:
          profile.website ??
          "",

        street:
          profile.businessAddress
            ?.street ?? "",

        houseNumber:
          profile.businessAddress
            ?.houseNumber ?? "",

        addition:
          profile.businessAddress
            ?.addition ?? "",

        postalCode:
          profile.businessAddress
            ?.postalCode ?? "",

        city:
          profile.businessAddress
            ?.city ?? "",

        country:
          profile.businessAddress
            ?.country ??
          "Nederland",

        iban:
          profile.iban ??
          "",

        bic:
          profile.bic ??
          "",

        invoiceEmail:
          profile.invoiceEmail ??
          "",

        footerText:
          profile.footerText ??
          "",

        defaultPaymentTermDays:
          String(
            profile
              .defaultPaymentTermDays ??
            30,
          ),

        invoicePrefix:
          profile.invoicePrefix ||
          "F",

        creditPrefix:
          profile.creditPrefix ||
          "C",
      });

      if (
        !profile.companyName ||
        !profile.invoiceEmail
      ) {
        setEditing(true);
      }

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Factuurprofiel kon niet worden geladen.",
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
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/invoicing/profile",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            body:
              JSON.stringify({
                organizationId:
                  context.organizationId,

                companyName:
                  form.companyName,

                registrationNumber:
                  form.registrationNumber,

                vatNumber:
                  form.vatNumber,

                phone:
                  form.phone,

                website:
                  form.website,

                businessAddress: {
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

                iban:
                  form.iban,

                bic:
                  form.bic,

                invoiceEmail:
                  form.invoiceEmail,

                footerText:
                  form.footerText,

                defaultPaymentTermDays:
                  Number(
                    form.defaultPaymentTermDays,
                  ),

                invoicePrefix:
                  form.invoicePrefix,

                creditPrefix:
                  form.creditPrefix,
              }),
          },
        );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
          "Factuurprofiel kon niet worden opgeslagen.",
        );
      }

      setSuccess(
        "Factuurinstellingen opgeslagen.",
      );

      setEditing(false);

      await load();

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Factuurprofiel kon niet worden opgeslagen.",
      );
    } finally {
      setBusy(false);
    }
  }


  async function uploadLogo(
    event:
      React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    if (
      !file ||
      context.organizationId ===
        "all"
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const body =
        new FormData();

      body.append(
        "organizationId",
        context.organizationId,
      );

      body.append(
        "file",
        file,
      );

      const response =
        await fetch(
          "/api/invoicing/logo",
          {
            method:
              "POST",
            body,
          },
        );

      const result =
        (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
          "Logo kon niet worden opgeslagen.",
        );
      }

      setLogoStoragePath(
        result.logoStoragePath ??
        null,
      );

      setSuccess(
        "Logo opgeslagen.",
      );

    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Logo kon niet worden opgeslagen.",
      );
    } finally {
      setBusy(false);
      event.target.value =
        "";
    }
  }


  if (
    context.organizationId ===
    "all"
  ) {
    return null;
  }


  const companyComplete =
    Boolean(
      form.companyName &&
      form.invoiceEmail &&
      form.street &&
      form.postalCode &&
      form.city,
    );


  return (
    <section className="card invoice-profile-manager invoice-settings-card">

      <div className="invoice-settings-summary-head">

        <div className="invoice-settings-title">
          <div className="invoice-settings-icon">
            <Settings2 size={20} />
          </div>

          <div>
            <h2>
              Factuurinstellingen
            </h2>

            <p>
              Instellingen die worden gebruikt voor je verkoopfacturen.
            </p>
          </div>
        </div>


        {!editing && !loading && (
          <button
            type="button"
            className="btn invoice-settings-manage"
            onClick={() => {
              setEditing(true);
              setSuccess("");
            }}
          >
            <Settings2 size={15} />
            Instellingen beheren
          </button>
        )}

      </div>


      {error && (
        <div
          className="notice"
          role="alert"
        >
          {error}
        </div>
      )}


      {success && (
        <div
          className="notice"
          role="status"
        >
          {success}
        </div>
      )}


      {loading ? (
        <div className="invoice-settings-loading">
          Factuurinstellingen worden geladen...
        </div>
      ) : !editing ? (

        <div className="invoice-settings-summary">

          <div className="invoice-settings-summary-item">
            <div className="invoice-settings-summary-icon">
              <ImageUp size={18} />
            </div>

            <div>
              <strong>
                {logoStoragePath
                  ? "Logo ingesteld"
                  : "Nog geen logo"}
              </strong>

              <span>
                {logoStoragePath
                  ? "Je bedrijfslogo wordt gebruikt op facturen."
                  : "Voeg een bedrijfslogo toe via Instellingen beheren."}
              </span>
            </div>

            {logoStoragePath && (
              <CheckCircle2
                className="invoice-settings-ok"
                size={17}
              />
            )}
          </div>


          <div className="invoice-settings-summary-item">
            <div className="invoice-settings-summary-icon">
              <Building2 size={18} />
            </div>

            <div>
              <strong>
                {companyComplete
                  ? "Bedrijfsgegevens compleet"
                  : "Bedrijfsgegevens aanvullen"}
              </strong>

              <span>
                {companyComplete
                  ? form.companyName
                  : "Controleer de verplichte factuurgegevens."}
              </span>
            </div>

            {companyComplete && (
              <CheckCircle2
                className="invoice-settings-ok"
                size={17}
              />
            )}
          </div>


          <div className="invoice-settings-summary-item">
            <div className="invoice-settings-summary-icon">
              <Save size={18} />
            </div>

            <div>
              <strong>
                Betaaltermijn{" "}
                {form.defaultPaymentTermDays} dagen
              </strong>

              <span>
                Standaard betaaltermijn voor nieuwe facturen.
              </span>
            </div>

            <CheckCircle2
              className="invoice-settings-ok"
              size={17}
            />
          </div>

        </div>

      ) : (

        <div className="invoice-settings-editor">

          <div className="invoice-settings-editor-head">
            <div>
              <strong>
                Factuurgegevens beheren
              </strong>

              <span>
                Deze gegevens hoef je normaal alleen te wijzigen wanneer je bedrijfs- of factuurgegevens veranderen.
              </span>
            </div>

            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError("");
                setSuccess("");
              }}
            >
              <X size={15} />
              Sluiten
            </button>
          </div>


          <form
            className="invoice-profile-form"
            onSubmit={save}
          >

            <div className="invoice-logo-box">
              <div className="invoice-logo-placeholder">
                <ImageUp />

                <strong>
                  Bedrijfslogo
                </strong>

                <span>
                  {logoStoragePath
                    ? "Logo ingesteld"
                    : "Nog geen logo ingesteld"}
                </span>
              </div>

              <label className="btn">
                Logo uploaden

                <input
                  hidden
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy}
                  onChange={uploadLogo}
                />
              </label>

              <small>
                PNG of JPG · maximaal 2 MB
              </small>
            </div>


            <div className="invoice-profile-fields">

              <label>
                Bedrijfsnaam *

                <input
                  required
                  maxLength={200}
                  value={form.companyName}
                  onChange={(event) =>
                    field(
                      "companyName",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                KvK-nummer

                <input
                  maxLength={40}
                  value={form.registrationNumber}
                  onChange={(event) =>
                    field(
                      "registrationNumber",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Btw-id

                <input
                  maxLength={40}
                  value={form.vatNumber}
                  onChange={(event) =>
                    field(
                      "vatNumber",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Factuur e-mailadres *

                <input
                  required
                  type="email"
                  maxLength={254}
                  value={form.invoiceEmail}
                  onChange={(event) =>
                    field(
                      "invoiceEmail",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                IBAN

                <input
                  maxLength={40}
                  value={form.iban}
                  onChange={(event) =>
                    field(
                      "iban",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                BIC

                <input
                  maxLength={20}
                  value={form.bic}
                  onChange={(event) =>
                    field(
                      "bic",
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
                Website

                <input
                  maxLength={200}
                  value={form.website}
                  onChange={(event) =>
                    field(
                      "website",
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
                  value={form.houseNumber}
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
                  value={form.addition}
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
                  value={form.postalCode}
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
                  value={form.country}
                  onChange={(event) =>
                    field(
                      "country",
                      event.target.value,
                    )
                  }
                />
              </label>


              <label>
                Standaard betaaltermijn

                <select
                  value={form.defaultPaymentTermDays}
                  onChange={(event) =>
                    field(
                      "defaultPaymentTermDays",
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

                  <option value="45">
                    45 dagen
                  </option>

                  <option value="60">
                    60 dagen
                  </option>
                </select>
              </label>


              <label>
                Factuurprefix

                <input
                  required
                  maxLength={10}
                  value={form.invoicePrefix}
                  onChange={(event) =>
                    field(
                      "invoicePrefix",
                      event.target.value
                        .toUpperCase(),
                    )
                  }
                />
              </label>


              <label>
                Creditprefix

                <input
                  required
                  maxLength={10}
                  value={form.creditPrefix}
                  onChange={(event) =>
                    field(
                      "creditPrefix",
                      event.target.value
                        .toUpperCase(),
                    )
                  }
                />
              </label>


              <label className="invoice-profile-wide">
                Voettekst op factuur

                <textarea
                  maxLength={500}
                  value={form.footerText}
                  onChange={(event) =>
                    field(
                      "footerText",
                      event.target.value,
                    )
                  }
                  placeholder="Bijvoorbeeld bedankt voor je opdracht."
                />
              </label>

            </div>


            <div className="invoice-profile-actions">
              <button
                type="submit"
                className="btn primary"
                disabled={busy}
              >
                <Save size={16} />

                {busy
                  ? "Opslaan..."
                  : "Factuurinstellingen opslaan"}
              </button>
            </div>

          </form>

        </div>
      )}

    </section>
  );
}
