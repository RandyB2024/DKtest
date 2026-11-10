import { matchAuthorizedContact, normalizeDutchMobile, type ContactCandidate } from "./phone-match";
import type { WhatsAppInboundEvent } from "./meta-event-parser";

export type RoutingDecision =
  | { status: "assign"; organizationId: string; contactId: string; phoneE164: string; providerPhoneNumberId: string }
  | { status: "manual_review"; reason: "invalid_phone" | "unknown_contact" | "ambiguous_contact" | "unauthorized_organization" | "unregistered_channel" };

/**
 * A safe routing decision is only a suggestion for server-side processing.
 * authorizedOrganizationIds MUST be derived from a trusted server-side
 * organization/channel relationship, never from a request body or phone number.
 * Actual inserts must re-check organization membership transactionally.
 */
export function decideWhatsAppRouting(
  event: WhatsAppInboundEvent,
  registeredProviderPhoneIds: ReadonlySet<string>,
  candidates: ContactCandidate[],
  authorizedOrganizationIds: ReadonlySet<string>,
): RoutingDecision {
  if (!registeredProviderPhoneIds.has(event.providerPhoneNumberId)) {
    return { status: "manual_review", reason: "unregistered_channel" };
  }
  const phoneE164 = normalizeDutchMobile(event.senderPhone.startsWith("+")
    ? event.senderPhone : "+" + event.senderPhone);
  if (!phoneE164) return { status: "manual_review", reason: "invalid_phone" };

  // Deliberately match against all known candidate associations first.
  // Filtering to authorized organizations before matching could turn a
  // genuinely ambiguous phone number into a misleading unique match.
  const match = matchAuthorizedContact(phoneE164, candidates);
  if (match.status === "unknown") return { status: "manual_review", reason: "unknown_contact" };
  if (match.status === "ambiguous") return { status: "manual_review", reason: "ambiguous_contact" };
  if (match.status !== "unique") return { status: "manual_review", reason: "invalid_phone" };
  const candidate = match.matches[0];
  if (!authorizedOrganizationIds.has(candidate.organizationId)) {
    return { status: "manual_review", reason: "unauthorized_organization" };
  }
  return {
    status: "assign",
    organizationId: candidate.organizationId,
    contactId: candidate.contactId,
    phoneE164,
    providerPhoneNumberId: event.providerPhoneNumberId,
  };
}
