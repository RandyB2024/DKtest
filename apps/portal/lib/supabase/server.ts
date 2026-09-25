import { MFA_TRUST_MAX_AGE_SECONDS } from "./trusted-mfa";
import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import { publicSupabaseConfig } from "./config";

export const contextCookie = "mdk_active_org";
export const cookieOptions: CookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: MFA_TRUST_MAX_AGE_SECONDS,
};

// Instantiate per request, including errors and refreshes. No shared auth state.
export function createRequestSupabase(request: Request) {
  const { url, key } = publicSupabaseConfig();
  const jar = new Map(parseCookieHeader(request.headers.get("cookie") ?? "").map(c => [c.name, c.value]));
  const outgoing = new Map<string, string>();
  function setCookie(name: string, value: string, options: CookieOptions = {}) {
    jar.set(name, value);
    outgoing.set(name, serializeCookieHeader(name, value, { ...options, ...cookieOptions, maxAge: options.maxAge === 0 ? 0 : cookieOptions.maxAge }));
  }
  const client = createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value, options }) => setCookie(name, value, options)),
    },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return {
    client,
    getCookie: (name: string) => jar.get(name),
    setCookie,
    finish(response: Response) {
      outgoing.forEach(value => response.headers.append("set-cookie", value));
      response.headers.set("cache-control", "private, no-store, max-age=0");
      response.headers.set("vary", "Cookie");
      response.headers.set("x-content-type-options", "nosniff");
      return response;
    },
  };
}
export type RequestSupabase = ReturnType<typeof createRequestSupabase>;
