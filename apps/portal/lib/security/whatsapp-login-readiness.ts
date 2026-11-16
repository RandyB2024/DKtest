import "server-only";

/**
 * WhatsApp login deliberately stays OFF until:
 * - Meta approves the Dutch Authentication / copy-code template for production WABA.
 * - The customer's phone number has independently verified ownership in BESTEMD.
 * - A short-lived, one-use challenge store and abuse controls are implemented.
 * - Successful verification is bound to the intended Supabase identity and preserves MFA.
 *
 * Changing only a Cloudflare variable must never silently enable a login path.
 */
export const WHATSAPP_LOGIN_READY = false as const;

export const WHATSAPP_LOGIN_NOT_AVAILABLE =
  "WhatsApp-inloggen is nog niet beschikbaar. Gebruik voorlopig je wachtwoord of e-mailcode.";
