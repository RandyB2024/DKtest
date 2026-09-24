import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { POST as login } from "../app/api/auth/login/route.ts";
import { POST as logout } from "../app/api/auth/logout/route.ts";
import { GET as context, POST as switchContext } from "../app/api/context/route.ts";
import { GET as organization } from "../app/api/organizations/[organizationId]/route.ts";
import { GET as factors, POST as mfa } from "../app/api/auth/mfa/route.ts";
import { POST as pdf } from "../app/api/billing/pdf/route.ts";
import { POST as finalize } from "../app/api/billing/finalize/route.ts";
import { POST as communications } from "../app/api/communications/route.ts";
import { POST as invite, DELETE as revokeInvite } from "../app/api/invitations/route.ts";
import { POST as insurance } from "../app/api/insurance/requests/route.ts";
import { GET as insuranceDocument } from "../app/api/insurance/documents/[documentId]/route.ts";
import { publicSupabaseConfig } from "../lib/supabase/config.ts";
import { membershipActive } from "../lib/portal-access.ts";

// Real Supabase SDK + real route handlers + real SSR cookie serialization.
// Only HTTP Auth/PostgREST is simulated; this does NOT claim to execute SQL/RLS.
const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let db, user, sessions, calls, password, cookieJar, initialAal, lifetime, roleMissing;
function json(data, status = 200) { return Response.json(data, { status }); }
function tokenSession(aal = initialAal) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, role: "authenticated", aal, exp: now + lifetime, iat: now, session_id: randomUUID() };
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.${Buffer.from(randomUUID()).toString("base64url")}`;
  const session = { access_token, refresh_token: randomUUID(), expires_in: lifetime, expires_at: payload.exp, token_type: "bearer", user: structuredClone(user) };
  sessions.set(access_token, { aal, refresh: session.refresh_token });
  return session;
}
function request(path, method = "GET", body, headers = {}) {
  return new Request(`https://portal.invalid${path}`, { method, headers: { origin: "https://portal.invalid", "content-type": "application/json", cookie: [...cookieJar].map(([k,v]) => `${k}=${v}`).join("; "), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function saveCookies(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";"); const split = pair.indexOf("=");
    if (/max-age=0/i.test(cookie)) cookieJar.delete(pair.slice(0, split));
    else cookieJar.set(pair.slice(0, split), pair.slice(split + 1));
  }
}
async function signIn() {
  const response = await login(request("/api/auth/login", "POST", { email: user.email, password }));
  assert.equal(response.status, 200); saveCookies(response); return response;
}
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sdk-fixture.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_testfixture";
  password = randomUUID(); cookieJar = new Map(); sessions = new Map(); calls = []; initialAal = "aal2"; lifetime = 3600; roleMissing = false;
  user = { id: randomUUID(), email: "fixture@example.invalid", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(), factors: [] };
  const org = { id: randomUUID(), name: "Fictieve testonderneming", legal_name: null, registration_number: null, archived_at: null };
  const role = { id: randomUUID(), scope: "customer" };
  db = {
    profiles: [{ id: user.id, email: user.email, display_name: "Testgebruiker", account_status: "active", mfa_required: true }],
    organization_memberships: [{ user_id: user.id, organization_id: org.id, role_id: role.id, status: "active", valid_from: new Date(Date.now() - 60000).toISOString(), valid_until: null }],
    organizations: [org, { ...org, id: randomUUID(), name: "Niet gekoppeld" }], roles: [role],
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    assert.equal(url.origin, "https://sdk-fixture.supabase.co", "Tests must never contact a real project");
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ path: url.pathname, query: url.searchParams, method });
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const active = [...sessions.values()].find(s => s.refresh === body.refresh_token);
        if (!active) return json({ message: "invalid", code: "refresh_token_not_found" }, 400);
        lifetime = 3600;
        return json(tokenSession(active.aal));
      }
      if (body.email !== user.email || body.password !== password) return json({ message: "Invalid login credentials", code: "invalid_credentials" }, 400);
      return json(tokenSession());
    }
    const token = headers.get("authorization")?.replace(/^Bearer /, "");
    if (!sessions.has(token)) return json({ message: "invalid", code: "bad_jwt" }, 401);
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname === "/auth/v1/logout") { sessions.clear(); return new Response(null, { status: 204 }); }
    if (url.pathname === "/auth/v1/factors" && method === "POST") {
      const id = randomUUID(); user.factors.push({ id, factor_type: "totp", status: "unverified", friendly_name: "Test" });
      return json({ id, type: "totp", totp: { qr_code: "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", secret: "SYNTHETIC-TEST-ONLY", uri: "" } });
    }
    if (url.pathname.endsWith("/challenge")) return json({ id: randomUUID(), expires_at: Math.floor(Date.now()/1000)+60, type: "totp" });
    if (url.pathname.endsWith("/verify")) {
      if (body.code !== "123456") return json({ message: "invalid", code: "mfa_verification_failed" }, 422);
      user.factors.forEach(f => { f.status = "verified"; });
      return json(tokenSession("aal2"));
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").pop();
      assert.equal(method, "GET", "No simulated module writes are allowed");
      let rows = structuredClone(db[table] ?? []);
      if (table === "roles" && roleMissing) return json({ message: "permission denied" }, 403);
      for (const [column, value] of url.searchParams) {
        if (value.startsWith("eq.")) rows = rows.filter(row => String(row[column]) === value.slice(3));
        else if (value.startsWith("in.(")) rows = rows.filter(row => value.slice(4,-1).split(",").includes(row[column]));
        else if (value === "is.null") rows = rows.filter(row => row[column] === null);
      }
      if (table === "profiles") return json(rows[0] ?? null);
      return json(rows);
    }
    throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

test("old demo credentials and wrong/unknown accounts all return identical 401", async () => {
  const attempts = [{ email: "demo@destinationknown.test", password: "Welkom2026!" }, { email: user.email, password: "wrong" }, { email: "unknown@example.invalid", password: "wrong" }];
  const bodies = [];
  for (const attempt of attempts) {
    const response = await login(request("/api/auth/login", "POST", attempt));
    assert.equal(response.status, 401); bodies.push(await response.text());
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  assert.equal(new Set(bodies).size, 1);
});
test("no session or forged old cookie cannot access context", async () => {
  assert.equal((await context(request("/api/context"))).status, 401);
  cookieJar.set("mdk_session", "user-randy");
  assert.equal((await context(request("/api/context"))).status, 401);
});
test("login cookies restore session on independent requests and only expose linked organizations", async () => {
  const response = await signIn();
  assert.ok(response.headers.getSetCookie().some(c => c.includes("HttpOnly") && c.includes("SameSite=Strict") && c.includes("Max-Age=28800")));
  for (let i = 0; i < 2; i++) {
    const loaded = await context(request("/api/context"));
    assert.equal(loaded.status, 200); assert.match(loaded.headers.get("cache-control"), /no-store/);
    const data = await loaded.json();
    assert.equal(data.profile.id, user.id); assert.deepEqual(data.organizations.map(o => o.id), [db.organizations[0].id]);
    assert.equal(data.organizationId, db.organizations[0].id);
  }
  assert.ok(calls.filter(c => c.path === "/auth/v1/user").length >= 3);
  assert.ok(calls.filter(c => c.path === "/rest/v1/organization_memberships").every(c => c.query.get("user_id") === `eq.${user.id}`));
});
test("foreign organization in body or path is 403; stale preference safely falls back", async () => {
  await signIn(); const id = db.organizations[1].id;
  assert.equal((await switchContext(request("/api/context", "POST", { organizationId: id, userId: randomUUID() }))).status, 403);
  assert.equal((await organization(request(`/api/organizations/${id}`), { params: Promise.resolve({ organizationId: id }) })).status, 403);
  cookieJar.set("mdk_active_org", id);
  assert.equal((await (await context(request("/api/context"))).json()).organizationId, db.organizations[0].id);
});
test("all organizations combines only active memberships; switch persists after reload", async () => {
  db.organization_memberships.push({ ...db.organization_memberships[0], organization_id: db.organizations[1].id });
  db.organizations.push({ ...db.organizations[0], id: randomUUID(), name: "Andere tenant" });
  await signIn();
  let response = await switchContext(request("/api/context", "POST", { organizationId: "all" }));
  assert.equal(response.status, 200); saveCookies(response);
  const data = await response.json(); assert.equal(data.organizations.length, 2); assert.equal(data.organizationId, "all");
  response = await switchContext(request("/api/context", "POST", { organizationId: db.organizations[1].id }));
  saveCookies(response);
  assert.equal((await (await context(request("/api/context"))).json()).organizationId, db.organizations[1].id);
});
test("Office-only, missing profile, blocked, archived, revoked, future and expired memberships are denied", async () => {
  const baseline = structuredClone(db);
  for (const mutate of [
    () => { db.organization_memberships = []; },
    () => { db.profiles = []; },
    () => { db.profiles[0].account_status = "blocked"; },
    () => { db.profiles[0].account_status = "archived"; },
    () => { db.roles[0].scope = "office"; },
    () => { db.organization_memberships[0].status = "revoked"; },
    () => { db.organization_memberships[0].valid_from = new Date(Date.now()+60000).toISOString(); },
    () => { db.organization_memberships[0].valid_until = new Date(Date.now()-1000).toISOString(); },
    () => { db.organizations[0].archived_at = new Date().toISOString(); },
  ]) {
    db = structuredClone(baseline); mutate();
    const response = await login(request("/api/auth/login", "POST", { email: user.email, password }));
    assert.equal(response.status, 401);
    assert.equal(sessions.size, 0);
  }
});
test("revocation after login is checked on next request", async () => {
  await signIn(); db.organization_memberships[0].status = "revoked";
  assert.equal((await context(request("/api/context"))).status, 403);
});
test("Auth-banned or deleted users cannot keep using an existing portal session", async () => {
  await signIn();
  user.banned_until = new Date(Date.now() + 60000).toISOString();
  assert.equal((await context(request("/api/context"))).status, 403);
  delete user.banned_until;
  user.deleted_at = new Date().toISOString();
  assert.equal((await context(request("/api/context"))).status, 403);
});
test("valid_until boundary is exclusive, invalid dates fail closed", () => {
  const membership = db.organization_memberships[0], now = Date.now();
  assert.equal(membershipActive({ ...membership, valid_until: new Date(now).toISOString() }, now), false);
  assert.equal(membershipActive({ ...membership, valid_from: "bad" }, now), false);
});
test("logout clears SDK cookies and invalidates next requests", async () => {
  await signIn();
  const response = await logout(request("/api/auth/logout", "POST"));
  assert.equal(response.status, 200); saveCookies(response);
  assert.equal(sessions.size, 0);
  assert.equal((await context(request("/api/context"))).status, 401);
});
test("expired access token refresh is returned as updated cookies", async () => {
  lifetime = 300; await signIn();
  // Advance cookie expiry locally to force the SDK refresh path, keeping the
  // synthetic refresh credential in the fixture Auth server.
  const name = [...cookieJar.keys()].find(n => n.startsWith("sb-"));
  const stored = JSON.parse(Buffer.from(decodeURIComponent(cookieJar.get(name)).slice(7), "base64url").toString());
  stored.expires_at = Math.floor(Date.now()/1000)-1;
  cookieJar.set(name, "base64-" + Buffer.from(JSON.stringify(stored)).toString("base64url"));
  const response = await context(request("/api/context"));
  assert.equal(response.status, 200); assert.ok(response.headers.getSetCookie().length > 0);
  assert.ok(calls.some(c => c.query.get("grant_type") === "refresh_token"));
  saveCookies(response); assert.equal((await context(request("/api/context"))).status, 200);
});
test("missing configuration and missing role SELECT fail closed", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.equal((await context(request("/api/context"))).status, 503);
  assert.equal(calls.length, 0);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sdk-fixture.supabase.co";
  roleMissing = true;
  assert.equal((await login(request("/api/auth/login", "POST", { email: user.email, password }))).status, 503);
});
test("public config rejects privileged keys, embedded credentials and insecure URLs", () => {
  for (const invalid of ["sb_secret_testfixture", "legacy-jwt-is-not-accepted", ""]) {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = invalid;
    assert.throws(publicSupabaseConfig);
  }
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_testfixture";
  for (const url of ["http://project.supabase.co", "https://user:pass@project.supabase.co", "https://project.supabase.co?key=x"]) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url; assert.throws(publicSupabaseConfig);
  }
});
test("cross-site login and context mutation are blocked; redirect input is ignored", async () => {
  assert.equal((await login(request("/api/auth/login", "POST", { email: user.email, password }, { origin: "https://attacker.invalid" }))).status, 403);
  assert.equal(calls.length, 0);
  const response = await login(request("/api/auth/login", "POST", { email: user.email, password, redirectTo: "//attacker.invalid" }));
  assert.equal((await response.json()).redirectTo, "/");
});
test("AAL1 only receives MFA prompt and cannot access financial/document routes", async () => {
  initialAal = "aal1"; await signIn();
  assert.deepEqual(await (await context(request("/api/context"))).json(), { mfaRequired: true });
  assert.equal((await pdf(request("/api/billing/pdf", "POST", { organizationId: db.organizations[0].id }))).status, 403);
  assert.equal((await insuranceDocument(request("/api/insurance/documents/fixture"))).status, 403);
  db.profiles[0].mfa_required = false;
  assert.equal((await pdf(request("/api/billing/pdf", "POST", { organizationId: db.organizations[0].id }))).status, 403);
});
test("TOTP enrollment, invalid code, verification and renewed session cookies", async () => {
  initialAal = "aal1"; await signIn();
  assert.deepEqual(await (await factors(request("/api/auth/mfa"))).json(), { factors: [] });
  const enrollment = await mfa(request("/api/auth/mfa", "POST", { action: "enroll" }));
  assert.equal(enrollment.status, 200); assert.match(enrollment.headers.get("cache-control"), /no-store/);
  const { factorId, qrCode } = await enrollment.json(); assert.match(qrCode, /^data:image/);
  const verify = code => mfa(request("/api/auth/mfa", "POST", { action: "verify", factorId, code }));
  assert.equal((await verify("000000")).status, 401);
  const response = await verify("123456"); assert.equal(response.status, 200); saveCookies(response);
  assert.equal((await (await context(request("/api/context"))).json()).aal2, true);
  assert.equal((await mfa(request("/api/auth/mfa", "POST", { action: "enroll" }))).status, 409);
  await signIn();
  assert.deepEqual(await (await context(request("/api/context"))).json(), { mfaRequired: true });
  assert.equal((await (await factors(request("/api/auth/mfa"))).json()).factors.length, 1);
});
test("unmigrated mutation endpoints never pretend success, even at AAL2", async () => {
  await signIn();
  for (const [handler, method] of [[finalize,"POST"],[pdf,"POST"],[communications,"POST"],[invite,"POST"],[revokeInvite,"DELETE"],[insurance,"POST"]]) {
    const response = await handler(request("/api/fixture", method, { organizationId: db.organizations[0].id }));
    assert.equal(response.status, 503);
  }
});
test("runtime entry graph contains no seed authorization, D1 or privileged key configuration", () => {
  const visited = new Set();
  function visit(path) {
    if (visited.has(path)) return; visited.add(path);
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /Welkom2026!|demo@destinationknown|ed@example\.test|mdk_session|service_role|sb_secret_|env\.DB|\/lib\/seed/);
    for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
      const spec = match[1]; if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      if (/\.css$/.test(spec)) continue;
      const stem = spec.startsWith("@/") ? resolve(root, spec.slice(2)) : resolve(dirname(path), spec);
      const next = [stem+".ts",stem+".tsx",stem+"/index.ts"].find(p => { try { readFileSync(p); return true; } catch { return false; } });
      if (next) visit(next);
    }
  }
  function routes(dir) { for (const item of readdirSync(dir, { withFileTypes: true })) { const path = resolve(dir,item.name); if (item.isDirectory()) routes(path); else if (/route\.ts$/.test(path)) visit(path); } }
  visit(resolve(root,"app/page.tsx")); visit(resolve(root,"app/layout.tsx")); routes(resolve(root,"app/api"));
  assert.ok(visited.size > 10);
  assert.ok(![...visited].some(p => /[\\/]lib[\\/](seed|access|billing|communications|insurance)\.ts$/.test(p)));
});
