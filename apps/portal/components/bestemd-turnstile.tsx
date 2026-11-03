"use client";

import { useEffect, useRef, useState } from "react";

const SITE_KEY = "0x4AAAAAAFpT-skt1iIyGuh1";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function BestemdTurnstile({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let active = true;
    let id: string | null = null;

    const mount = () => {
      if (!active || !container.current || !window.turnstile || id !== null) return;

      id = window.turnstile.render(container.current, {
        sitekey: SITE_KEY,
        action: "login",
        theme: "auto",
        callback: (token: string) => {
          if (!active) return;
          setFailed(false);
          callback.current(token);
        },
        "expired-callback": () => {
          if (active) callback.current("");
        },
        "error-callback": () => {
          if (!active) return;
          callback.current("");
          setFailed(true);
        },
      });
    };

    if (!document.querySelector('script[data-bestemd-turnstile="true"]')) {
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.dataset.bestemdTurnstile = "true";
      document.head.appendChild(script);
    }

    mount();
    const interval = setInterval(mount, 150);

    return () => {
      active = false;
      clearInterval(interval);
      if (id !== null && window.turnstile) window.turnstile.remove(id);
    };
  }, []);

  return (
    <div style={{ margin: "16px 0" }}>
      <div ref={container} />
      {failed && (
        <p role="alert" className="bestemd-auth-error">
          De beveiligingscontrole kon niet worden geladen.
          Vernieuw de pagina en probeer opnieuw.
        </p>
      )}
    </div>
  );
}
