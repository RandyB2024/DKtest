import "server-only";

/** Never use a CRM-only phone number as proof of account ownership. */
export function whatsappLoginEnabled() {
  return process.env.WHATSAPP_LOGIN_ENABLED === "true"
    && process.env.WHATSAPP_SMS_HOOK_CONFIRMED === "true";
}

export function normalizeWhatsappPhone(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const clean = input.replace(/[\s().-]/g, "");
  const result = /^06\d{8}$/.test(clean)
    ? "+31" + clean.slice(1)
    : /^0031[1-9]\d{8}$/.test(clean)
      ? "+" + clean.slice(2)
      : clean;
  return /^\+[1-9]\d{7,14}$/.test(result) ? result : null;
}

export const WHATSAPP_LOGIN_GENERIC =
  "Als dit mobiele nummer is gekoppeld aan een geverifieerd BESTEMD-account, ontvang je een code via WhatsApp.";
