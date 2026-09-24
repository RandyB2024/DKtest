import { unavailableModule } from "@/lib/portal-api";
export async function POST(request: Request) { return unavailableModule(request, true); }