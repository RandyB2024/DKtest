import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Only synchronize previously linked bookings. An incoming webhook cannot
// choose an organization. New bookings must be linked via a verified flow.
export const runtime = "nodejs";

type BookingPayload = {
  uid?: string;
  bookingUid?: string;
  startTime?: string;
  endTime?: string;
  start?: string;
  end?: string;
  title?: string;
  rescheduleUid?: string;
};

function verify(raw: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !url || !serviceKey) return Response.json({ error: "Unavailable" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 65536) return Response.json({ error: "Payload too large" }, { status: 413 });
  if (!verify(raw, request.headers.get("x-cal-signature-256"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: { triggerEvent?: string; payload?: BookingPayload };
  try { event = JSON.parse(raw); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const trigger = event.triggerEvent;
  if (!["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"].includes(trigger ?? "")) {
    return Response.json({ ok: true, ignored: true });
  }
  const booking = event.payload ?? {};
  const uid = booking.uid ?? booking.bookingUid;
  if (!uid || typeof uid !== "string" || uid.length > 300) {
    return Response.json({ error: "Missing UID" }, { status: 400 });
  }

  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Webhooks are only allowed to update an already linked UID. No cross-org
  // assignment or creation from untrusted booking metadata or attendee email.
  const { data: existing, error: lookupError } = await client
    .from("bestemd_calendar_bookings")
    .select("calcom_uid,organization_id")
    .eq("calcom_uid", uid)
    .maybeSingle();
  if (lookupError) return Response.json({ error: "Database unavailable" }, { status: 503 });
  if (!existing) return Response.json({ ok: true, ignored: "unlinked_booking" });

  const cancelled = trigger === "BOOKING_CANCELLED";
  const start = booking.startTime ?? booking.start;
  const end = booking.endTime ?? booking.end;
  const patch: Record<string, string> = {
    status: cancelled ? "cancelled" : "planned",
    updated_at: new Date().toISOString(),
  };
  if (!cancelled) {
    if (!start || !end || !Number.isFinite(Date.parse(start)) ||
        !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
      return Response.json({ error: "Invalid booking dates" }, { status: 400 });
    }
    patch.starts_at = start;
    patch.ends_at = end;
  }
  if (typeof booking.title === "string") patch.title = booking.title.slice(0, 500);
  const { error } = await client.from("bestemd_calendar_bookings")
    .update(patch).eq("calcom_uid", uid).eq("organization_id", existing.organization_id);
  if (error) return Response.json({ error: "Sync unavailable" }, { status: 503 });
  return Response.json({ ok: true });
}
