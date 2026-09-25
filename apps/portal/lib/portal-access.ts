import { validatedTotp } from "./supabase/trusted-mfa";
import type { SupabaseClient } from "@supabase/supabase-js";

export class AccessError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export type PortalProfile = { id: string; email: string; display_name: string; account_status: string; mfa_required: boolean };
export type PortalOrganization = { id: string; name: string; legal_name: string | null; registration_number: string | null; archived_at: string | null };
export type PortalMembership = { organization_id: string; role_id: string; status: string; valid_from: string; valid_until: string | null };
export type PortalIdentity = { profile: PortalProfile; memberships: PortalMembership[]; organizations: PortalOrganization[]; aal2: boolean };
export type PortalContext = PortalIdentity & { organizationId: string };

export function membershipActive(m: PortalMembership, now = Date.now()) {
  return m.status === "active" && Date.parse(m.valid_from) <= now && (m.valid_until === null || Date.parse(m.valid_until) > now);
}

export async function requirePortalIdentity(client: SupabaseClient): Promise<PortalIdentity> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new AccessError(401, "Log opnieuw in.");
  if (auth.user.deleted_at || auth.user.is_anonymous || (auth.user.banned_until && Date.parse(auth.user.banned_until) > Date.now())) {
    throw new AccessError(403, "Geen toegang tot het klantportaal.");
  }
  const { data: profile, error: profileError } = await client.from("profiles")
    .select("id,email,display_name,account_status,mfa_required").eq("id", auth.user.id).maybeSingle();
  if (profileError) throw new AccessError(503, "Toegang kan tijdelijk niet worden gecontroleerd.");
  if (!profile || profile.account_status !== "active") throw new AccessError(403, "Geen toegang tot het klantportaal.");
  const { data: rows, error: membershipError } = await client.from("organization_memberships")
    .select("organization_id,role_id,status,valid_from,valid_until").eq("user_id", auth.user.id).eq("status", "active");
  if (membershipError) throw new AccessError(503, "Toegang kan tijdelijk niet worden gecontroleerd.");
  const active = ((rows ?? []) as PortalMembership[]).filter(m => membershipActive(m));
  if (!active.length) throw new AccessError(403, "Geen toegang tot het klantportaal.");
  // Enforce customer scope independently of any Office membership.
  const { data: roles, error: roleError } = await client.from("roles").select("id").eq("scope", "customer").in("id", active.map(m => m.role_id));
  if (roleError) throw new AccessError(503, "Toegang kan tijdelijk niet worden gecontroleerd.");
  const memberships = active.filter(m => roles?.some(r => r.id === m.role_id));
  if (!memberships.length) throw new AccessError(403, "Geen toegang tot het klantportaal.");
  const aal2 = await validatedTotp(client, auth.user.id);
  // Auth bootstrap exposes no organization data before fresh MFA. RLS also hides it.
  if (!aal2) return { profile, memberships, organizations: [], aal2: false };
  const { data: orgs, error: orgError } = await client.from("organizations")
    .select("id,name,legal_name,registration_number,archived_at").in("id", memberships.map(m => m.organization_id)).is("archived_at", null);
  if (orgError) throw new AccessError(503, "Ondernemingen kunnen tijdelijk niet worden geladen.");
  const organizations = (orgs ?? []) as PortalOrganization[];
  if (!organizations.length) throw new AccessError(403, "Geen toegang tot het klantportaal.");
  return { profile, memberships: memberships.filter(m => organizations.some(o => o.id === m.organization_id)), organizations, aal2 };
}

export function requireAal2(identity: PortalIdentity) {
  if (!identity.aal2) throw new AccessError(403, "Bevestig eerst uw identiteit met tweestapsverificatie.", "MFA_REQUIRED");
}
export function requireOrganization(identity: PortalIdentity, id: unknown, allowAll = false): string {
  if (typeof id !== "string" || !(identity.organizations.some(o => o.id === id) || (allowAll && id === "all" && identity.organizations.length > 1))) {
    throw new AccessError(403, "Geen toegang tot deze onderneming.");
  }
  return id;
}
export function resolvePortalContext(identity: PortalIdentity, preferred?: string): string {
  if (identity.organizations.length === 1) return identity.organizations[0].id;
  return preferred && (preferred === "all" || identity.organizations.some(o => o.id === preferred)) ? preferred : "all";
}
