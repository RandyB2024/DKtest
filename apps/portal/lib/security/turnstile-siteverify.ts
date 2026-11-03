import { env } from "cloudflare:workers";

/**
 * Alleen voor de server.
 *
 * Niet afdwingend totdat TURNSTILE_ENFORCE_LOGIN=true.
 * Bij ingeschakelde handhaving wordt zonder geldig bewijs
 * nooit een wachtwoordaanmelding uitgevoerd.
 */
export async function requireLoginTurnstile(
  token: unknown,
): Promise<void> {
  if ((env as unknown as { TURNSTILE_ENFORCE_LOGIN?: string }).TURNSTILE_ENFORCE_LOGIN !== "true") {
    return;
  }

  const deny = () => {
    throw new Error("TURNSTILE_VERIFICATION_FAILED");
  };

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048
  ) {
    return deny();
  }

  const secret = (
    env as unknown as {
      TURNSTILE_SECRET?: string;
    }
  ).TURNSTILE_SECRET;

  if (!secret) {
    return deny();
  }

  let result: {
    success?: boolean;
    hostname?: string;
    action?: string;
  };

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret,
          response: token,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return deny();
    }

    result = (await response.json()) as typeof result;
  } catch {
    return deny();
  }

  if (
    result.success !== true ||
    result.hostname !== "app.mijnbestemd.nl" ||
    result.action !== "login"
  ) {
    return deny();
  }
}