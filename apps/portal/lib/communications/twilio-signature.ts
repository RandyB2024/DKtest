/**
 * Twilio validates form-encoded webhook requests using the exact public URL,
 * alphabetically sorted form parameter names and HMAC-SHA1 (base64).
 * The Auth Token is a server-side secret; never expose it to Office browsers.
 */
export async function verifyTwilioSignature(
  url: string,
  form: URLSearchParams,
  signature: string | null,
  authToken: string,
): Promise<boolean> {
  if (!signature || !authToken || !url.startsWith("https://")) return false;
  const names = [...new Set(form.keys())].sort();
  // Twilio's form signature scheme assumes unique parameter names.
  if (names.some(name => form.getAll(name).length !== 1)) return false;
  const signed = url + names.map(name => name + form.get(name)).join("");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signed)));
  const expected = btoa(String.fromCharCode(...bytes));
  const a = encoder.encode(expected);
  const b = encoder.encode(signature);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
