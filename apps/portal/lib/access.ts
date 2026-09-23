import type { Membership, Permission, Role } from "./models";
import { memberships, organizations, users } from "./seed";
export const permissionGroups: Array<{ label: string; permissions: Permission[] }> = [
  { label: "Inzicht", permissions: ["dashboard:view", "financials:view", "reports:view"] },
  { label: "Facturen en documenten", permissions: ["invoices:view", "invoice:create", "invoice:send", "documents:view", "document:upload", "document:delete"] },
  { label: "Contact en planning", permissions: ["messages:view", "message:send", "appointments:view", "appointment:plan"] },
  { label: "Administratie", permissions: ["returns:view", "return:approve", "vehicles:manage", "profile:view", "profile:edit"] },
  { label: "Gebruikers", permissions: ["users:view", "users:invite", "users:manage"] },
  { label: "Verzekeringen", permissions: ["insurance:view", "policy:view", "policy-document:download", "insurance-change:submit", "claim:submit", "claim:view", "insurance-message:view", "insurance-message:send", "insurance-advice:request", "insurance-permissions:manage"] },
];
const allPermissions = permissionGroups.flatMap(g => g.permissions);
export const rolePermissions: Record<Role, Permission[]> = {
  "Eigenaar": allPermissions,
  "Beheerder": allPermissions.filter(p => !["users:manage", "insurance-permissions:manage"].includes(p)),
  "Financieel medewerker": ["dashboard:view", "financials:view", "reports:view", "invoices:view", "invoice:create", "invoice:send", "documents:view", "document:upload", "messages:view", "message:send", "appointments:view", "returns:view", "vehicles:manage", "profile:view"],
  "Documenten aanleveren": ["dashboard:view", "documents:view", "document:upload", "messages:view"],
  "Alleen bekijken": ["dashboard:view", "financials:view", "reports:view", "invoices:view", "documents:view", "messages:view", "appointments:view", "returns:view", "profile:view"],
  "Aangepaste rol": ["dashboard:view"],
};
export function activeMemberships(userId: string, now = new Date("2026-09-18T12:00:00+02:00")): Membership[] { const user = users.find(u => u.id === userId); if (!user || user.accountStatus !== "Actief") return []; return memberships.filter(m => m.userId === userId && m.status === "active" && new Date(m.validFrom) <= now && (!m.validUntil || new Date(m.validUntil) >= now)); }
export function membershipFor(userId: string, organizationId: string): Membership | undefined { return activeMemberships(userId).find(m => m.organizationId === organizationId); }
export function permissionsFor(membership?: Membership): Permission[] { return membership ? [...new Set([...rolePermissions[membership.role], ...(membership.additionalPermissions ?? [])])] : []; }
export function can(userId: string, organizationId: string, permission: Permission): boolean { return permissionsFor(membershipFor(userId, organizationId)).includes(permission); }
export function authorizedOrganizations(userId: string) { const allowed = new Set(activeMemberships(userId).map(m => m.organizationId)); return organizations.filter(o => allowed.has(o.id)); }
export function resolveOrganizationContext(userId: string, preferred?: string): string | "all" { const allowed = authorizedOrganizations(userId); if (preferred === "all" && allowed.length > 1) return "all"; if (preferred && allowed.some(o => o.id === preferred)) return preferred; const saved = users.find(u => u.id === userId)?.lastOrganizationId; if (saved && allowed.some(o => o.id === saved)) return saved; return allowed.length > 1 ? "all" : allowed[0]?.id ?? "all"; }
export function assertOrganizationAccess(userId: string, organizationId: string, permission: Permission = "dashboard:view") { if (!can(userId, organizationId, permission)) throw new Error(membershipFor(userId, organizationId) ? "INSUFFICIENT_ROLE" : "FORBIDDEN"); }
export function canManageUsers(userId: string, organizationId: string) { return can(userId, organizationId, "users:view"); }
export function isLastOwner(userId: string, organizationId: string) { return memberships.filter(m => m.organizationId === organizationId && m.status === "active" && m.role === "Eigenaar").every(m => m.userId === userId); }
