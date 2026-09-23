import Login from "@/components/login";
import Portal from "@/components/portal";
import { getValidatedContext, requireSessionUser } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function Home() { const userId = await requireSessionUser(); if (!userId) return <Login />; const initialOrganizationId = await getValidatedContext(userId); return <Portal userId={userId} initialOrganizationId={initialOrganizationId} />; }
