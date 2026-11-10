/**
 * BESTEMD communication: conservative Dutch mobile matching.
 * Phone numbers are contact hints, never proof of identity or authorization.
 * Do not expose contacts from other organizations to a portal user.
 */
export function normalizeDutchMobile(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]+$/.test(cleaned)) return null;
  let normalized: string;
  if (/^06[0-9]{8}$/.test(cleaned)) normalized = "+31" + cleaned.slice(1);
  else if (/^00316[0-9]{8}$/.test(cleaned)) normalized = "+" + cleaned.slice(2);
  else if (/^\+316[0-9]{8}$/.test(cleaned)) normalized = cleaned;
  else return null;
  return normalized;
}

export type ContactCandidate = {
  contactId: string;
  organizationId: string;
  phone: string;
};

export type PhoneMatch =
  | { status: "invalid" | "unknown" | "ambiguous"; matches: [] }
  | { status: "unique"; matches: [ContactCandidate] };

/**
 * Input candidates MUST already be restricted by the server to the authorized
 * tenant scope. Ambiguous matches are never assigned to an organization.
 */
export function matchAuthorizedContact(phone: unknown, candidates: ContactCandidate[]): PhoneMatch {
  const normalized = normalizeDutchMobile(phone);
  if (!normalized) return { status: "invalid", matches: [] };
  const matches = candidates.filter(candidate => normalizeDutchMobile(candidate.phone) === normalized);
  const unique = new Map(matches.map(candidate => [candidate.organizationId + ":" + candidate.contactId, candidate]));
  if (unique.size === 0) return { status: "unknown", matches: [] };
  if (unique.size !== 1) return { status: "ambiguous", matches: [] };
  return { status: "unique", matches: [unique.values().next().value!] };
}
