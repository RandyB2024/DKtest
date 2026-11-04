import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export {};",
        shortCircuit: true,
      };
    }
    if (specifier === "cloudflare:workers") {
      return {
        url: "data:text/javascript,export const env = { get NEXT_PUBLIC_SUPABASE_URL() { return process.env.NEXT_PUBLIC_SUPABASE_URL; }, SUPABASE_SERVICE_ROLE_KEY: \"fixture-service-role-key\" };",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});