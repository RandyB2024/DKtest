"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PortalContext } from "@/lib/portal-access";
import Login from "./login";
import Portal from "./portal";
import Mfa from "./mfa";
import Logout from "./logout";

type State = { kind: "loading" | "login" | "mfa" | "error"; message?: string } | { kind: "portal"; context: PortalContext };
export default function PortalEntry() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const pending = useRef(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const response = await fetch("/api/context", { cache: "no-store" });
      const data = await response.json() as PortalContext & { error?: string; mfaRequired?: boolean };
      if (response.status === 401) setState({ kind: "login" });
      else if (!response.ok) setState({ kind: "error", message: data.error });
      else if (data.mfaRequired) setState({ kind: "mfa" });
      else setState({ kind: "portal", context: data });
    } catch { setState({ kind: "error", message: "Geen verbinding. Uw gegevens zijn niet offline beschikbaar." }); }
    finally { pending.current = false; }
  }, []);
  useEffect(() => {
    // External API bootstrap; state changes follow the awaited network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    window.addEventListener("focus", load);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [load]);
  if (state.kind === "login") return <Login />;
  if (state.kind === "mfa") return <Mfa onComplete={load} />;
  if (state.kind === "portal") return <Portal context={state.context} onContext={context => setState({ kind: "portal", context })} onRefresh={load} />;
  return <main className="login"><section className="login-panel"><div className="login-box"><h1>Mijn Destination Known</h1><p role="status">{state.kind === "loading" ? "Uw beveiligde sessie wordt gecontroleerd…" : state.message}</p>{state.kind === "error" && <><button className="btn primary" onClick={load}>Opnieuw proberen</button><Logout /></>}</div></section></main>;
}
