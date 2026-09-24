import { unavailableModule } from "@/lib/portal-api";
export async function GET(request: Request) { return unavailableModule(request, true); }