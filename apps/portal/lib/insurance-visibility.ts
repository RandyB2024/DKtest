/**
 * Insurance is offered only after the selected business has a verified
 * Klaas Vis relationship AND at least one actual policy in its authorized
 * organization-scoped API response. Unknown/error responses fail closed.
 */
type Obj = Record<string, unknown>;
const record = (v: unknown): Obj | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Obj : null;

export function insurancePolicies(data: unknown): Obj[] {
  const body = record(data);
  const rows = body?.policies ?? body?.verzekeringen;
  return Array.isArray(rows) ? rows.filter((v): v is Obj => record(v) !== null) : [];
}

export function hasVerifiedKlaasVisInsurance(data: unknown): boolean {
  const body = record(data);
  if (!body) return false;
  const relation = record(body.relationship);
  const verified = relation
    ? relation.verified === true || Boolean(relation.verified_at) || Boolean(relation.verifiedAt)
    : body.verified === true || body.linked === true;
  return verified && insurancePolicies(body).length > 0;
}
