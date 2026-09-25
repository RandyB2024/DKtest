import { trustedMfaConfig } from "./trusted-mfa";
export class ConfigurationError extends Error {
  constructor() { super("Supabase is niet veilig geconfigureerd. Neem contact op met de beheerder."); }
}

// Explicit public variable names only; never discover or forward server secrets.
export function publicSupabaseConfig() {
  try { trustedMfaConfig(process.env.MFA_TRUST_MAX_AGE_SECONDS); } catch { throw new ConfigurationError(); }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ConfigurationError();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error();
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error();
  } catch { throw new ConfigurationError(); }
  return { url, key };
}
