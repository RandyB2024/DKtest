import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = new URL(
  "../lib/security/guarded-password-login.ts",
  import.meta.url
);

test("login vereist eerst een reservering", async () => {
  const source = await readFile(file, "utf8");

  const reserve = source.indexOf("await reserveLoginAttempt(email)");
  const login = source.indexOf("await client.auth.signInWithPassword");

  assert.ok(reserve >= 0);
  assert.ok(login > reserve);
});

test("geblokkeerde reservering leidt tot weigering", async () => {
  const source = await readFile(file, "utf8");

  assert.match(
    source,
    /if \(!reservation\.allowed \|\| !reservation\.reservation_id\)/
  );
});

test("mislukte reservering veroorzaakt beveiligingsfout", async () => {
  const source = await readFile(file, "utf8");

  assert.match(
    source,
    /throw new LoginSecurityUnavailableError\(\)/
  );
});

test("wachtwoordresultaat wordt geregistreerd", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /await completeLoginAttempt/);
  assert.match(source, /authenticated/);
});

test("mislukte afronding probeert sessie af te melden", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /client\.auth\.signOut/);
  assert.match(source, /scope: "local"/);
});

test("onvoltooide of geblokkeerde login wordt geweigerd", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /!completion\.accepted/);
  assert.match(source, /completion\.is_locked/);
  assert.match(source, /!authenticated/);
});