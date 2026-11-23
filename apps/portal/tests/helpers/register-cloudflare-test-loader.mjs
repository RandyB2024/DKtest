// Test runner only: synchronous Node module hook intercepts only Cloudflare's
// virtual env binding. All TypeScript loading is left to the tsx runner.
// No cloud credentials or live endpoints are used in the test environment.
import { registerHooks } from "node:module";

const syntheticEnvironmentUrl = new URL("./cloudflare-test-env.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return { url: syntheticEnvironmentUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
