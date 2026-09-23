import { cookies } from "next/headers";
import { activeMemberships, resolveOrganizationContext } from "./access";
import { users } from "./seed";
export async function requireSessionUser(): Promise<string | null> { const value = (await cookies()).get("mdk_session")?.value; const user = users.find(item => item.id === value); return user?.accountStatus === "Actief" ? user.id : null; }
export async function getValidatedContext(userId: string): Promise<string | "all"> { const preferred = (await cookies()).get("mdk_active_org")?.value; return resolveOrganizationContext(userId, preferred); }
export function hasAnyMembership(userId: string) { return activeMemberships(userId).length > 0; }
