"use client";
import { useState } from "react";

export default function Logout() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      location.replace("/");
    } catch { setError("Uitloggen is niet gelukt. Probeer het opnieuw."); setBusy(false); }
  }
  return <><button className="btn" disabled={busy} onClick={logout}>{busy ? "Uitloggen…" : "Uitloggen"}</button>{error && <p role="alert">{error}</p>}</>;
}
