import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const office = readFileSync(
  new URL('../src/supabase-api.mjs', import.meta.url), 'utf8'
);
const customer = readFileSync(
  new URL('../../portal/app/api/inventory/disposals/route.ts', import.meta.url), 'utf8'
);
const migration = readFileSync(
  new URL('../../portal/supabase/migrations/202611040315_office_inventory_disposal_review.sql', import.meta.url),
  'utf8'
);
const table = readFileSync(
  new URL('../../portal/supabase/migrations/202611040294_inventory_disposal_requests.sql', import.meta.url),
  'utf8'
);

test('Office vereist een geverifieerde identiteit', () => {
  assert.match(office, /const user = await officeIdentity\(client\)/);
});

test('Alleen owner en admin mogen beoordelen', () => {
  const section = office.split('BESTEMD_DISPOSAL_REVIEW_302')[1]
    ?.split('BESTEMD_DISPOSAL_QUEUE_297')[0];
  assert.ok(section);
  assert.match(section, /\['owner', 'admin'\]\.includes\(user\.roleCode\)/);
});

test('Office valideert beslissing en verplichte toelichting', () => {
  assert.match(office, /\['approved', 'rejected'\]\.includes\(decision\)/);
  assert.match(office, /decision === 'rejected' && !reviewNote\.trim\(\)/);
});

test('De beoordelingsroute gebruikt de afgeschermde RPC', () => {
  assert.match(office, /office_review_inventory_disposal/);
  assert.match(office, /DISPOSAL_REVIEW_NOT_COMPLETED/);
});

test('Klantverzoeken vereisen MFA en ondernemingsautorisatie', () => {
  assert.match(customer, /requirePortalIdentity\(client\)/);
  assert.match(customer, /requireAal2\(identity\)/);
  assert.match(customer, /requireOrganization\(identity, input\.organizationId\)/);
});

test('SQL vereist MFA en actieve Office-beheerrechten', () => {
  assert.match(migration, /public\.has_aal2\(\)/);
  assert.match(migration, /m\.status = 'active'/);
  assert.match(migration, /p\.account_status = 'active'/);
  assert.match(migration, /r\.code IN \('owner', 'admin'\)/);
});

test('SQL vergrendelt verzoek en verhindert dubbele beoordeling', () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /v_request\.status <> 'pending'/);
  assert.match(table, /inventory_disposal_one_pending/);
});

test('Audit en beoordeling staan in een transactie; financieel blijft uit', () => {
  assert.match(migration, /UPDATE public\.inventory_disposal_requests/);
  assert.match(migration, /INSERT INTO public\.audit_events/);
  assert.match(migration, /'financiallyProcessed', false/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION/);
  assert.match(table, /enable row level security/i);
});