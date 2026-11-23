// Resolve Cloudflare's virtual bindings ONLY for isolated Node unit tests.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: new URL("./cloudflare-test-env.mjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
