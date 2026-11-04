import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

async function setup() {
  const pg = new PGlite();

  try {
    await pg.exec(`
      create schema auth;
      create role anon;
      create role authenticated;
      create role service_role;

      create function auth.role()
      returns text
      language sql
      stable
      as $$
        select current_setting('request.jwt.claim.role', true)
      $$;

      select set_config(
        'request.jwt.claim.role',
        'service_role',
        false
      );
    `);

    for (const name of [
      "202611030001_login_account_lockout.sql",
      "202611030002_login_attempt_reservation.sql",
      "202611030003_login_attempt_completion.sql"
    ]) {
      const sql = await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8"
      );
      await pg.exec(sql);
    }

    return pg;
  } catch (error) {
    await pg.close();
    throw error;
  }
}

async function reserve(pg, email) {
  const result = await pg.query(
    "select * from public.bestemd_login_reserve_v1($1)",
    [email]
  );
  return result.rows[0];
}

async function complete(pg, id, success) {
  const result = await pg.query(
    "select * from public.bestemd_login_complete_v1($1, $2)",
    [id, success]
  );
  return result.rows[0];
}

async function locked(pg, email) {
  const result = await pg.query(
    "select public.bestemd_login_lockout_check_v1($1) as value",
    [email]
  );
  return result.rows[0].value;
}

test("drie foutieve pogingen leiden tot vijftien minuten blokkering", async () => {
  const pg = await setup();
  try {
    const email = "lockout@example.invalid";

    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await reserve(pg, email);
      assert.equal(r.allowed, true);
      assert.ok(r.reservation_id);

      const c = await complete(pg, r.reservation_id, false);
      assert.equal(c.accepted, true);
      assert.equal(c.attempts, attempt);
      assert.equal(c.is_locked, attempt === 3);
    }

    assert.equal(await locked(pg, email), true);
    assert.equal((await reserve(pg, email)).allowed, false);

    const state = await pg.query(
      `select locked_until, updated_at
       from bestemd_security.login_account_lockouts
       where account_key = $1`,
      [email]
    );

    const seconds = (
      new Date(state.rows[0].locked_until) -
      new Date(state.rows[0].updated_at)
    ) / 1000;

    assert.ok(seconds > 899 && seconds <= 901);
  } finally {
    await pg.close();
  }
});

test("een reservering kan niet tweemaal worden afgerond", async () => {
  const pg = await setup();
  try {
    const r = await reserve(pg, "duplicate@example.invalid");
    assert.equal(r.allowed, true);

    const first = await complete(pg, r.reservation_id, false);
    const second = await complete(pg, r.reservation_id, false);

    assert.equal(first.accepted, true);
    assert.equal(second.accepted, false);

    const state = await pg.query(
      `select failed_attempts
       from bestemd_security.login_account_lockouts
       where account_key = $1`,
      ["duplicate@example.invalid"]
    );
    assert.equal(state.rows[0].failed_attempts, 1);
  } finally {
    await pg.close();
  }
});

test("een openstaande reservering verhindert een tweede reservering", async () => {
  const pg = await setup();
  try {
    const email = "pending@example.invalid";
    const first = await reserve(pg, email);
    const second = await reserve(pg, email);

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, false);

    const completed = await complete(pg, first.reservation_id, false);
    assert.equal(completed.accepted, true);

    const third = await reserve(pg, email);
    assert.equal(third.allowed, true);
  } finally {
    await pg.close();
  }
});

test("verlopen reserveringen kunnen niet worden afgerond", async () => {
  const pg = await setup();
  try {
    const email = "expired@example.invalid";
    const r = await reserve(pg, email);

    await pg.query(
      `update bestemd_security.login_attempt_reservations
       set expires_at = now() - interval '1 second'
       where reservation_id = $1`,
      [r.reservation_id]
    );

    const result = await complete(pg, r.reservation_id, false);
    assert.equal(result.accepted, false);

    const retry = await reserve(pg, email);
    assert.equal(retry.allowed, true);
  } finally {
    await pg.close();
  }
});

test("succesvolle login reset de teller maar niet een actieve blokkering", async () => {
  const pg = await setup();
  try {
    const email = "success@example.invalid";

    for (let i = 0; i < 2; i++) {
      const r = await reserve(pg, email);
      await complete(pg, r.reservation_id, false);
    }

    const success = await reserve(pg, email);
    const result = await complete(pg, success.reservation_id, true);

    assert.equal(result.accepted, true);
    assert.equal(result.attempts, 0);
    assert.equal(result.is_locked, false);

    const retry = await reserve(pg, email);
    const failure = await complete(pg, retry.reservation_id, false);
    assert.equal(failure.attempts, 1);
  } finally {
    await pg.close();
  }
});

test("gewone gebruikers mogen reservering en afronding niet uitvoeren", async () => {
  const pg = await setup();
  try {
    for (const fn of [
      "public.bestemd_login_reserve_v1(text)",
      "public.bestemd_login_complete_v1(uuid,boolean)"
    ]) {
      const result = await pg.query(
        `select
           has_function_privilege('anon', $1, 'EXECUTE') as anon,
           has_function_privilege('authenticated', $1, 'EXECUTE') as user_role,
           has_function_privilege('service_role', $1, 'EXECUTE') as server_role`,
        [fn]
      );

      assert.equal(result.rows[0].anon, false);
      assert.equal(result.rows[0].user_role, false);
      assert.equal(result.rows[0].server_role, true);
    }
  } finally {
    await pg.close();
  }
});