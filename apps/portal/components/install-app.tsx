/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { Download, Share2, WifiOff, X } from "lucide-react";
import { detectInstallPlatform, installLabel, type InstallPlatform } from "@/lib/pwa";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallApp({ placement = "floating" }: { placement?: "floating" | "header" }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform>("unsupported");
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);
    setOnline(navigator.onLine);
    setPlatform(detectInstallPlatform(navigator.userAgent, false));
    const ready = (promptEvent: Event) => { promptEvent.preventDefault(); setEvent(promptEvent as InstallEvent); setPlatform(detectInstallPlatform(navigator.userAgent, true)); };
    const done = () => { setInstalled(true); setEvent(null); setShowHelp(false); };
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  async function install() {
    if (platform === "ios-safari" || platform === "ios-other") { setShowHelp(true); return; }
    if (!event) { setShowHelp(true); return; }
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setEvent(null);
  }

  const visible = !installed;
  return <>
    {!online && <div className="offline-banner"><WifiOff size={16} /> U bent offline. Klantgegevens zijn niet gecachet; sommige onderdelen zijn tijdelijk niet beschikbaar.</div>}
    {visible && <button className={`${placement === "header" ? "install-app-header" : "install-app"} btn primary`} onClick={install}><Download size={16} /><span>{installLabel(platform) || "Installeer app"}</span></button>}
    {showHelp && <div className="install-overlay" role="dialog" aria-modal="true" aria-labelledby="install-title"><div className="install-dialog"><button className="close" onClick={() => setShowHelp(false)} aria-label="Sluiten"><X /></button><div className="install-symbol"><Share2 /></div><h2 id="install-title">Mijn Destination Known installeren</h2>{platform === "ios-other" ? <p>Open deze pagina in Safari om Mijn Destination Known op uw beginscherm te zetten.</p> : platform === "ios-safari" ? <ol><li>Tik onderaan in Safari op het deelsymbool.</li><li>Kies <strong>Zet op beginscherm</strong>.</li><li>Controleer de naam <strong>Mijn Destination Known</strong>.</li><li>Tik op <strong>Voeg toe</strong>.</li></ol> : <p>Kies in het menu van uw browser voor <strong>App installeren</strong> of <strong>Deze pagina installeren</strong>. Is die optie nog niet beschikbaar, ververs dan de pagina.</p>}</div></div>}
  </>;
}
