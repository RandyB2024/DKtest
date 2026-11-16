import { whatsappLoginEnabled } from "@/lib/security/whatsapp-login";

export async function GET() {
  return Response.json(
    { enabled: whatsappLoginEnabled() },
    { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
