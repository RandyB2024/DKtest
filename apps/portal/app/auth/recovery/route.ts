import { createRequestSupabase } from "@/lib/supabase/server";
import { ConfigurationError } from "@/lib/supabase/config";

/**
 * Auth recovery callback. Missing or invalid query parameters are normal:
 * always redirect the browser without requiring a configured Supabase client.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const invalidUrl = new URL("/reset-password?error=invalid", url.origin);
  if (!tokenHash || type !== "recovery" || tokenHash.length > 4096) {
    return Response.redirect(invalidUrl, 303);
  }

  let session: ReturnType<typeof createRequestSupabase>;
  try {
    session = createRequestSupabase(request);
  } catch (error) {
    // An infrastructure/configuration failure must not pretend that the
    // user's valid recovery link has expired.
    const message = error instanceof ConfigurationError
      ? "De wachtwoordherstelservice is tijdelijk niet beschikbaar."
      : "De herstelservice is tijdelijk niet beschikbaar.";
    return Response.json({ error: message }, {
      status: 503,
      headers: { "cache-control": "private, no-store" },
    });
  }

  try {
    const { error } = await session.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error) {
      return session.finish(Response.redirect(invalidUrl, 303));
    }
    return session.finish(Response.redirect(new URL("/reset-password", url.origin), 303));
  } catch {
    return session.finish(Response.json({
      error: "Wachtwoordherstel is tijdelijk niet beschikbaar. Probeer het later opnieuw.",
    }, { status: 503 }));
  }
}
