/**
 * Meta WhatsApp webhook signature validation for Cloudflare Workers / Web Crypto.
 * Call with the unmodified raw request body BEFORE JSON parsing.
 * No inbound message may be persisted or routed unless verification succeeds.
 */
const SIGNATURE_PREFIX = "sha256=";

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) return null;
  return Uint8Array.from({ length: 32 }, (_, i) => parseInt(value.slice(i * 2, i * 2 + 2), 16));
}

export async function verifyMetaWebhookSignature(
  rawBody: ArrayBuffer | Uint8Array,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret || !signatureHeader?.startsWith(SIGNATURE_PREFIX)) return false;
  const signature = hexToBytes(signatureHeader.slice(SIGNATURE_PREFIX.length));
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const body = rawBody instanceof Uint8Array ? rawBody : new Uint8Array(rawBody);
  return crypto.subtle.verify("HMAC", key, signature, body);
}

/**
 * GET challenge verification is separate from POST signature verification.
 * Never log the configured verify token, the received token, or message bodies.
 */
export function verifyMetaWebhookChallenge(
  mode: string | null,
  receivedToken: string | null,
  configuredToken: string,
  challenge: string | null,
): string | null {
  if (mode !== "subscribe" || !configuredToken || !receivedToken || receivedToken !== configuredToken) return null;
  if (!challenge || !/^\d{1,20}$/.test(challenge)) return null;
  return challenge;
}
