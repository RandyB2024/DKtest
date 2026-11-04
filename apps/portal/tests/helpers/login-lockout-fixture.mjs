/**
 * Test-only fake of the two privileged login-lockout RPC endpoints.
 * Real route handlers and the guarded login implementation remain under test.
 * A fresh instance must be created for each test, never used in production.
 */
import { randomUUID } from "node:crypto";

export function createLoginLockoutFixture() {
  const pending = new Map();
  const failedAttempts = new Map();
  const lockedUntil = new Map();

  return function handleLoginLockoutRpc(url, body, headers) {
    const path = url.pathname;
    if (path !== "/rest/v1/rpc/bestemd_login_reserve_v1" &&
        path !== "/rest/v1/rpc/bestemd_login_complete_v1") return null;

    // Unlike a normal user token, these RPCs require a privileged test credential.
    const bearer = headers.get("authorization")?.replace(/^Bearer /i, "");
    if (bearer !== "fixture-service-role-key") {
      return Response.json({ message: "Permission denied" }, { status: 403 });
    }

    if (path.endsWith("bestemd_login_reserve_v1")) {
      const key = body?.p_account_key;
      if (typeof key !== "string" || !key || key !== key.trim().toLowerCase()) {
        return Response.json({ message: "Invalid account key" }, { status: 400 });
      }
      const until = lockedUntil.get(key) || 0;
      if (until > Date.now()) {
        return Response.json([{ allowed: false, reservation_id: null }]);
      }
      const id = randomUUID();
      pending.set(id, key);
      return Response.json([{ allowed: true, reservation_id: id }]);
    }

    const id = body?.p_reservation_id;
    if (typeof id !== "string" || !pending.has(id) || typeof body?.p_success !== "boolean") {
      return Response.json({ message: "Invalid or consumed reservation" }, { status: 400 });
    }
    const key = pending.get(id);
    pending.delete(id);
    const attempts = body.p_success ? 0 : (failedAttempts.get(key) || 0) + 1;
    failedAttempts.set(key, attempts);
    if (attempts >= 3) lockedUntil.set(key, Date.now() + 15 * 60 * 1000);
    return Response.json([{
      accepted: true,
      is_locked: (lockedUntil.get(key) || 0) > Date.now(),
      attempts,
      lock_expires_at: lockedUntil.has(key) ? new Date(lockedUntil.get(key)).toISOString() : null,
    }]);
  };
}
