import {
  createRequestSupabase,
} from "@/lib/supabase/server";

export async function GET(
  request: Request,
) {
  const url =
    new URL(request.url);

  const tokenHash =
    url.searchParams.get(
      "token_hash",
    );

  const type =
    url.searchParams.get(
      "type",
    );

  const session =
    createRequestSupabase(
      request,
    );

  if (
    !tokenHash ||
    type !== "recovery"
  ) {
    return session.finish(
      Response.redirect(
        new URL(
          "/reset-password?error=invalid",
          request.url,
        ),
        303,
      ),
    );
  }

  const { error } =
    await session.client.auth
      .verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

  if (error) {
    return session.finish(
      Response.redirect(
        new URL(
          "/reset-password?error=invalid",
          request.url,
        ),
        303,
      ),
    );
  }

  return session.finish(
    Response.redirect(
      new URL(
        "/reset-password",
        request.url,
      ),
      303,
    ),
  );
}
