import test from 'node:test';
import assert from 'node:assert/strict';

import {
  onboardingNewCustomerRoute
} from '../src/onboarding-new-customer-route.mjs';

const endpoint = new URL(
  'http://localhost/api/onboarding/new-customer'
);

const validInput = {
  customerName: 'Test Ondernemer',
  companyName: 'Voorbeeldbedrijf B.V.',
  email: 'test@example.invalid'
};

const authorizedUser = {
  canManageCustomers: true,
  aal2: true
};

function mockClient(response = {
  data: {
    relationship_id: '11111111-1111-4111-8111-111111111111',
    application_id: '22222222-2222-4222-8222-222222222222',
    status: 'draft'
  },
  error: null
}) {
  const calls = [];

  return {
    calls,
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      return response;
    }
  };
}

function invoke({
  client = mockClient(),
  user = authorizedUser,
  input = validInput,
  url = endpoint
} = {}) {
  return onboardingNewCustomerRoute(
    { method: 'POST' },
    url,
    client,
    user,
    async () => input
  );
}

test('bevoegde Office-gebruiker kan een concept aanvragen', async () => {
  const client = mockClient();
  const result = await invoke({ client });

  assert.equal(result.status, 201);
  assert.equal(result.data.status, 'draft');
  assert.equal(result.data.emailSent, false);
  assert.equal(client.calls.length, 1);

  assert.equal(
    client.calls[0].name,
    'office_create_onboarding_new_customer'
  );

  assert.deepEqual(client.calls[0].parameters, {
    p_customer_name: validInput.customerName,
    p_company_name: validInput.companyName,
    p_email: validInput.email
  });
});

test('medewerker zonder beheerdersrechten wordt geweigerd', async () => {
  const client = mockClient();

  await assert.rejects(
    invoke({
      client,
      user: { canManageCustomers: false, aal2: true }
    }),
    { status: 403, code: 'ONBOARDING_DENIED' }
  );

  assert.equal(client.calls.length, 0);
});

test('medewerker zonder MFA wordt geweigerd', async () => {
  const client = mockClient();

  await assert.rejects(
    invoke({
      client,
      user: { canManageCustomers: true, aal2: false }
    }),
    { status: 403, code: 'ONBOARDING_DENIED' }
  );

  assert.equal(client.calls.length, 0);
});

test('ongeldig e-mailadres wordt geweigerd', async () => {
  const client = mockClient();

  await assert.rejects(
    invoke({
      client,
      input: { ...validInput, email: 'geen-emailadres' }
    }),
    { status: 400, code: 'INVALID_ONBOARDING_INPUT' }
  );

  assert.equal(client.calls.length, 0);
});

test('onbekende invoervelden worden geweigerd', async () => {
  const client = mockClient();

  await assert.rejects(
    invoke({
      client,
      input: { ...validInput, role: 'owner' }
    }),
    { status: 400, code: 'INVALID_ONBOARDING_INPUT' }
  );

  assert.equal(client.calls.length, 0);
});

test('dubbele aanvraag levert HTTP 409 op', async () => {
  const client = mockClient({
    data: null,
    error: { code: '23505', message: 'duplicate' }
  });

  await assert.rejects(
    invoke({ client }),
    { status: 409, code: 'ONBOARDING_EXISTS' }
  );
});

test('databasefout levert HTTP 503 op', async () => {
  const client = mockClient({
    data: null,
    error: { code: 'XX000', message: 'database error' }
  });

  await assert.rejects(
    invoke({ client }),
    { status: 503, code: 'ONBOARDING_UNAVAILABLE' }
  );
});

test('onvolledige databasebevestiging wordt geweigerd', async () => {
  const client = mockClient({
    data: { status: 'draft' },
    error: null
  });

  await assert.rejects(
    invoke({ client }),
    { status: 503, code: 'ONBOARDING_UNAVAILABLE' }
  );
});

test('andere API-route wordt genegeerd', async () => {
  const client = mockClient();

  const result = await invoke({
    client,
    url: new URL('http://localhost/api/other')
  });

  assert.equal(result, null);
  assert.equal(client.calls.length, 0);
});