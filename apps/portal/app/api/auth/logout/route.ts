import { NextResponse } from "next/server";
export async function POST() { const response = NextResponse.json({ ok: true }); response.cookies.set("mdk_session", "", { httpOnly: true, maxAge: 0, path: "/" }); response.cookies.set("mdk_active_org", "", { httpOnly: true, maxAge: 0, path: "/" }); return response; }
