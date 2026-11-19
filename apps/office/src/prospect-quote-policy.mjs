// BESTEMD 4.0 — controleer offerteprijzen per onderneming vóór verzending.
// Geen afronding van ongeldige bedragen en geen impliciete prijs 0 bij lege invoer.
const money = (value, field) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
    throw new Error(field + ' ontbreekt.');
  }
  const normalized = String(value).trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(field + ' moet een positief bedrag met maximaal twee decimalen zijn.');
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents > 10_000_000) {
    throw new Error(field + ' is te hoog.');
  }
  return cents / 100;
};
export function validateQuoteLines(lines, companies) {
  if (!Array.isArray(companies) || !companies.length || companies.length > 5 ||
      !Array.isArray(lines) || lines.length !== companies.length) {
    throw new Error('Vul per onderneming één prijsafspraak in.');
  }
  const positions = companies.map(company => Number(company?.position));
  if (new Set(positions).size !== positions.length ||
      positions.some(position => !Number.isInteger(position) || position < 1 || position > 5)) {
    throw new Error('Ongeldige ondernemingsselectie.');
  }
  const seen = new Set();
  const parsed = new Map();
  for (const raw of lines) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
        !Number.isInteger(raw.position) || !positions.includes(raw.position) || seen.has(raw.position)) {
      throw new Error('Dubbele of onbekende onderneming in de offerte.');
    }
    seen.add(raw.position);
    const service = typeof raw.service === 'string' ? raw.service.trim() : '';
    if (!service || service.length > 1500) {
      throw new Error('Beschrijf de dienstverlening per onderneming.');
    }
    parsed.set(raw.position, {
      position: raw.position,
      service,
      monthlyPriceExVat: money(raw.monthlyPriceExVat, 'Maandtarief'),
      oneTimePriceExVat: money(raw.oneTimePriceExVat ?? 0, 'Eenmalig tarief'),
      notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0,1000) : '',
    });
  }
  return companies.map(company => {
    const quote = parsed.get(company.position);
    if (!quote) throw new Error('Prijsafspraak ontbreekt voor een onderneming.');
    return {
      ...quote,
      companyName: String(company.company_data?.companyName || company.company_data?.name || '').trim().slice(0,200),
    };
  });
}
