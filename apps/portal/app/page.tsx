import PortalEntry from "@/components/portal-entry";

// Public shell only. Bootstrap uses a route handler that can return renewed
// HttpOnly cookies, including on reload. No customer data is rendered here.
export default function Home() { return <PortalEntry />; }