"use client";
import { useEffect, useState } from "react";

type Existing = { status: string } | null;
const reasons = [
  ["sold", "Verkocht"], ["discarded", "Weggegooid / afgevoerd"],
  ["broken", "Defect / onbruikbaar"], ["stolen", "Gestolen"],
  ["lost", "Verloren"], ["other", "Andere reden"],
] as const;

export default function InventoryDisposalAction({ organizationId, itemId }: {
  organizationId: string;
  itemId: string;
}) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<Existing>(null);
  const [reason, setReason] = useState("sold");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ organizationId, itemId });
    void fetch(`/api/inventory/disposals?${params}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Afmeldstatus niet beschikbaar.");
        return response.json() as Promise<{ item: Existing }>;
      })
      .then(data => { if (active) setExisting(data.item); })
      .catch(() => { if (active) setError("Afmeldstatus kon niet worden geladen."); });
    return () => { active = false; };
  }, [organizationId, itemId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    let saleAmountCents: number | null = null;
    if (reason === "sold" && price.trim()) {
      if (!/^\d+(?:[,.]\d{1,2})?$/.test(price.trim())) {
        setError("Vul een geldige verkoopprijs in, bijvoorbeeld 125,50."); return;
      }
      saleAmountCents = Math.round(Number(price.replace(",", ".")) * 100);
      if (!Number.isSafeInteger(saleAmountCents)) { setError("Verkoopprijs is ongeldig."); return; }
    }
    setBusy(true);
    try {
      const response = await fetch("/api/inventory/disposals", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId, itemId, reason, effectiveDate: date,
          saleAmountCents, note,
        }),
      });
      const result = (await response.json()) as { item?: Existing; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Afmelding mislukt.");
      setExisting({ status: "pending" });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Afmelding mislukt.");
    } finally { setBusy(false); }
  }

  if (existing?.status === "pending") return <small>Afmelding in behandeling</small>;
  return (
    <div>
      <button type="button" className="btn" disabled={busy}
        onClick={() => setOpen(value => !value)}>
        {open ? "Sluiten" : "Niet meer in bezit?"}
      </button>
      {error && <p role="alert">{error}</p>}
      {open && <form onSubmit={submit} className="inventory-form">
        <label>Reden
          <select value={reason} onChange={event => setReason(event.target.value)} required>
            {reasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Datum
          <input type="date" value={date} max={new Date().toLocaleDateString("en-CA")}
            onChange={event => setDate(event.target.value)} required />
        </label>
        {reason === "sold" && <label>Verkoopprijs incl. btw (optioneel)
          <input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="125,50" />
        </label>}
        <label>Toelichting (optioneel)
          <textarea maxLength={1500} value={note} onChange={event => setNote(event.target.value)} />
        </label>
        <small>De melding wordt door BESTEMD beoordeeld. Er wordt niets automatisch afgeboekt.</small>
        <button className="btn primary" type="submit" disabled={busy || !date}>
          {busy ? "Versturen..." : "Afmelding versturen"}
        </button>
      </form>}
    </div>
  );
}