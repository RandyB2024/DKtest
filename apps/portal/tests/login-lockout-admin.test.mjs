import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = new URL(
  "../lib/security/login-lockout-admin.ts",
  import.meta.url
);

test("adminmodule blijft uitsluitend server-side", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /import "server-only"/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(
    source,
    /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/
  );
});

test("ontbrekende configuratie wordt geweigerd", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /if \(!url \|\| !key\)/);
  assert.match(
    source,
    /Loginbeveiliging is niet geconfigureerd/
  );
});

test("reservering gebruikt uitsluitend beveiligde RPC", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /bestemd_login_reserve_v1/);
  assert.match(source, /p_account_key/);
  assert.match(source, /throw new Error\("Loginreservering mislukt\."\)/);
});

test("afronding gebruikt reserverings-ID en resultaat", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /bestemd_login_complete_v1/);
  assert.match(source, /p_reservation_id/);
  assert.match(source, /p_success/);
  assert.match(source, /throw new Error\("Afronding loginbeveiliging mislukt\."\)/);
});

test("databaseantwoorden worden gecontroleerd", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /Array\.isArray\(data\)/);
  assert.match(source, /typeof row\.allowed !== "boolean"/);
  assert.match(source, /typeof row\.accepted !== "boolean"/);
  assert.match(source, /typeof row\.is_locked !== "boolean"/);
});

test("adminclient bewaart geen sessie", async () => {
  const source = await readFile(file, "utf8");

  assert.match(source, /persistSession: false/);
  assert.match(source, /autoRefreshToken: false/);
  assert.match(source, /detectSessionInUrl: false/);
});