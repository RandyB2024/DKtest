// Read-only Office fixed-assets page. No browser-side Supabase secrets or postings.
const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
const money = cents => Number.isSafeInteger(cents) ? euro.format(cents / 100) : 'Controle nodig';

export async function mountOfficeFixedAssets(container, api, clientData) {
  if (!container || typeof api !== 'function') return;
  const organizations = (clientData?.organizations ?? [])
    .filter(o => UUID.test(o.id) && !o.archived_at);
  const heading = el('section', undefined, 'panel');
  heading.append(
    el('p', 'Administratie · Bedrijfsmiddelen', 'eyebrow'),
    el('h2', 'Bedrijfsmiddelen en Wize-voorstellen'),
    el('p', 'Facturen worden alleen ter beoordeling aangeboden. Er worden geen bedrijfsmiddelen aangemaakt of boekingen uitgevoerd.')
  );
  const controls = el('section', undefined, 'panel');
  const label = el('label', 'Selecteer onderneming');
  const selection = el('select');
  const initial = el('option', 'Kies een onderneming');
  initial.value = '';
  selection.append(initial);
  for (const org of organizations) {
    const option = el('option', org.name ?? org.id);
    option.value = org.id;
    selection.append(option);
  }
  label.append(selection);
  controls.append(label);
  const results = el('section', undefined, 'panel');
  results.setAttribute('aria-live', 'polite');
  const register = el('section', undefined, 'panel');
  register.append(el('p', 'Register en afschrijvingen', 'eyebrow'),
    el('h2', 'Bestaande bedrijfsmiddelen'),
    el('p', 'Het bestaande SQLite-register is nog niet aangesloten op deze Supabase Office-weergave. Wij tonen daarom geen fictieve saldi of afschrijvingen.'));
  container.replaceChildren(heading, controls, results, register);

  let requestNumber = 0;
  const refresh = async () => {
    const id = selection.value;
    const current = ++requestNumber;
    if (!UUID.test(id)) {
      results.replaceChildren(el('p', organizations.length ? 'Selecteer een onderneming om voorstellen te bekijken.' : 'Geen toegankelijke ondernemingen gevonden.'));
      return;
    }
    results.replaceChildren(el('p', 'Wize-voorstellen worden veilig opgehaald…'));
    try {
      const data = await api('/api/office/asset-drafts?organizationId=' + encodeURIComponent(id));
      if (current !== requestNumber || !container.isConnected || selection.value !== id) return;
      if (data?.organizationId !== id || !Array.isArray(data.drafts)) throw new Error('INVALID_RESPONSE');
      const title = el('h2', 'Te beoordelen Wize-voorstellen');
      const note = el('p', 'Alle voorstellen blijven concept. Goedkeuren en boeken zijn nog niet beschikbaar.');
      if (!data.drafts.length) {
        results.replaceChildren(title, note, el('p', 'Geen voorstellen die wachten op beoordeling.'));
        return;
      }
      const table = el('table');
      const thead = el('thead'), head = el('tr');
      for (const name of ['Factuur', 'Omschrijving', 'Datum', 'Aanschafwaarde', 'Btw', 'Totaal', 'Controle']) head.append(el('th', name));
      thead.append(head);
      const body = el('tbody');
      for (const item of data.drafts) {
        const row = el('tr');
        for (const value of [
          item.invoiceNumber || '—', item.description || 'Niet herkend', item.invoiceDate || '—',
          money(item.acquisitionCents), money(item.vatCents), money(item.totalCents),
          item.amountsVerified ? 'Bedragen herkend · medewerker controleert' : 'Handmatige controle vereist'
        ]) row.append(el('td', value));
        body.append(row);
      }
      table.append(thead, body);
      const wrap = el('div', undefined, 'table-wrap');
      wrap.append(table);
      results.replaceChildren(title, note, wrap);
      if (data.truncated) results.append(el('p', 'Er zijn meer voorstellen. Paginering moet nog worden aangesloten.'));
    } catch {
      if (current === requestNumber && container.isConnected) {
        results.replaceChildren(el('h2', 'Wize-voorstellen tijdelijk niet beschikbaar'),
          el('p', 'De beveiligde verbinding of de Supabase-leesrechten zijn nog niet gereed. Er zijn geen boekingen uitgevoerd.'));
      }
    }
  };
  selection.addEventListener('change', refresh);
  await refresh();
}
