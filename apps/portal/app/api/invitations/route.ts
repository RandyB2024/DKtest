import { unavailableModule } from "@/lib/portal-api";
export async function POST(request: Request) { return unavailableModule(request, false); }
export async function DELETE(request: Request) { return unavailableModule(request, false); }