import { portalApi } from "@/lib/portal-api";
import { WHATSAPP_LOGIN_NOT_AVAILABLE } from "@/lib/security/whatsapp-login-readiness";

/**
 * Fail-closed reservation for future WhatsApp authentication.
 * Do not generate codes, send templates, or disclose account/number existence.
 */
export async function POST(request: Request) {
  return portalApi(request, async () =>
    Response.json(
      { error: WHATSAPP_LOGIN_NOT_AVAILABLE, code: "WHATSAPP_LOGIN_DISABLED" },
      { status: 503 },
    ),
  );
}
