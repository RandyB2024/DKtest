import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingListRoute } from '../src/onboarding-list-route.mjs';

const url = new URL('https://office.example.invalid/api/onboarding/applications');
const authorized = { canManageCustomers: true, aal2: true };

function clientWith(data = [], error = null) {
  const calls = [];
  return {
    calls,
    rpc: async (name) => { calls.push(name); return { data, error }; }
  };
}

test('bevoegde beheerder ziet een lijst met aanvragen', async () => {
  const client = clientWith([{ application_id: 'example', companies: [] }]);
  const result = await onboardingListRoute({ method: 'GET' }, url, client, authorized);
  assert.equal(result.status, 200);
  assert.equal(result.data.applications.length, 1);
  assert.deepEqual(client.calls, ['office_list_onboarding_applications']);
});

test('geen beheerdersrechten of MFA: geen databaseaanroep', async () => {
  for (const user of [
    { canManageCustomers: false, aal2: true },
    { canManageCustomers: true, aal2: false }
  ]) {
    const client = clientWith();
    await assert.rejects(
      onboardingListRoute({ method: 'GET' }, url, client, user),
      { status: 403, code: 'ONBOARDING_DENIED' }
    );
    assert.equal(client.calls.length, 0);
  }
});

test('geen queryparameters toegestaan', async () => {
  const client = clientWith();
  await assert.rejects(
    onboardingListRoute(
      { method: 'GET' },
      new URL(url.href + '?organization_id=other'),
      client,
      authorized
    ),
    { status: 400, code: 'INVALID_REQUEST' }
  );
  assert.equal(client.calls.length, 0);
});

test('fouten uit database worden niet naar gebruiker gelekt', async () => {
  const client = clientWith(null, { code: 'XX000', message: 'private database details' });
  await assert.rejects(
    onboardingListRoute({ method: 'GET' }, url, client, authorized),
    { status: 503, code: 'ONBOARDING_UNAVAILABLE' }
  );
});

test('ongeldige databaseuitkomst wordt geweigerd', async () => {
  await assert.rejects(
    onboardingListRoute({ method: 'GET' }, url, clientWith({}), authorized),
    { status: 503, code: 'ONBOARDING_UNAVAILABLE' }
  );
});

test('niet-bestaande route wordt genegeerd', async () => {
  const result = await onboardingListRoute(
    { method: 'GET' },
    new URL('https://office.example.invalid/api/other'),
    clientWith(),
    authorized
  );
  assert.equal(result, null);
});
