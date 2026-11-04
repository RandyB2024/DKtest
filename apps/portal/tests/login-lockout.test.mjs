import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("BESTEMD: 3 foutieve wachtwoorden blokkeren account", async () => {
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

    const sql = await readFile(
      new URL(
        "../supabase/migrations/202611030001_login_account_lockout.sql",
        import.meta.url
      ),
      "utf8"
    );

    await pg.exec(sql);

    const account = "test@example.invalid";

    async function record(success) {
      const result = await pg.query(
        `select * from public.bestemd_login_lockout_record_v1($1, $2)`,
        [account, success]
      );
      return result.rows[0];
    }

    async function isLocked() {
      const result = await pg.query(
        `select public.bestemd_login_lockout_check_v1($1) as locked`,
        [account]
      );
      return result.rows[0].locked;
    }

    assert.equal(await isLocked(), false);

    const first = await record(false);
    assert.equal(first.attempts, 1);
    assert.equal(first.is_locked, false);

    const second = await record(false);
    assert.equal(second.attempts, 2);
    assert.equal(second.is_locked, false);

    const third = await record(false);
    assert.equal(third.attempts, 3);
    assert.equal(third.is_locked, true);
    assert.ok(third.lock_expires_at);

    assert.equal(await isLocked(), true);

    // A successful result cannot override an active lock.
    const blockedSuccess = await record(true);
    assert.equal(blockedSuccess.is_locked, true);

    // Simulate expiry without waiting fifteen minutes.
    await pg.query(
      `update bestemd_security.login_account_lockouts
       set locked_until = now() - interval '1 second'
       where account_key = $1`,
      [account]
    );

    assert.equal(await isLocked(), false);

    const afterExpiry = await record(false);
    assert.equal(afterExpiry.attempts, 1);
    assert.equal(afterExpiry.is_locked, false);

    const success = await record(true);
    assert.equal(success.attempts, 0);
    assert.equal(success.is_locked, false);

    const finalState = await pg.query(
      `select failed_attempts, locked_until
       from bestemd_security.login_account_lockouts
       where account_key = $1`,
      [account]
    );

    assert.equal(finalState.rows[0].failed_attempts, 0);
    assert.equal(finalState.rows[0].locked_until, null);
  } finally {
    await pg.close();
  }
});

test("BESTEMD: gewone gebruikers mogen lockout-functies niet uitvoeren", async () => {
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
    `);

    const sql = await readFile(
      new URL(
        "../supabase/migrations/202611030001_login_account_lockout.sql",
        import.meta.url
      ),
      "utf8"
    );

    await pg.exec(sql);

    const result = await pg.query(`
      select
        has_function_privilege(
          'anon',
          'public.bestemd_login_lockout_record_v1(text,boolean)',
          'EXECUTE'
        ) as anon_allowed,
        has_function_privilege(
          'authenticated',
          'public.bestemd_login_lockout_record_v1(text,boolean)',
          'EXECUTE'
        ) as authenticated_allowed,
        has_function_privilege(
          'service_role',
          'public.bestemd_login_lockout_record_v1(text,boolean)',
          'EXECUTE'
        ) as service_allowed
    `);

    assert.equal(result.rows[0].anon_allowed, false);
    assert.equal(result.rows[0].authenticated_allowed, false);
    assert.equal(result.rows[0].service_allowed, true);
  } finally {
    await pg.close();
  }
});