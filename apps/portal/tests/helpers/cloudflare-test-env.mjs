// Synthetic data used by the local Auth/PostgREST fixtures.
 // No production secrets or live project endpoints.
export const env = new Proxy(Object.create(null), {
  get(_target, name) {
    if (name === "SUPABASE_SERVICE_ROLE_KEY") return "fixture-service-role-key";
    if (typeof name !== "string") return undefined;
    return process.env[name];
  },
});
