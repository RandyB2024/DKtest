"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import Mfa from "./mfa";
import Logout from "./logout";
import PersonalLogin from "./personal-login";
import PersonalPortal from "./personal-portal";


type Context = {
  profile: {
    id: string;
    email: string;
    display_name: string;
    account_status: string;
  };

  aal2: boolean;
};


type State =
  | {
      kind:
        | "loading"
        | "login"
        | "mfa"
        | "error";
      message?: string;
    }
  | {
      kind: "portal";
      context: Context;
    };


export default function PersonalEntry() {
  const [
    state,
    setState,
  ] =
    useState<State>({
      kind: "loading",
    });

  const pending =
    useRef(false);


  const load =
    useCallback(
      async () => {
        if (pending.current) {
          return;
        }

        pending.current = true;

        try {
          const response =
            await fetch(
              "/api/personal/context",
              {
                cache: "no-store",
              },
            );

          const data =
            await response.json() as
              Context & {
                error?: string;
                mfaRequired?: boolean;
              };


          if (
            response.status ===
            401
          ) {
            setState({
              kind: "login",
            });

          } else if (
            !response.ok
          ) {
            setState({
              kind: "error",
              message:
                data.error,
            });

          } else if (
            data.mfaRequired
          ) {
            setState({
              kind: "mfa",
            });

          } else {
            setState({
              kind: "portal",
              context: data,
            });
          }

        } catch {
          setState({
            kind: "error",
            message:
              "Geen verbinding. Jouw persoonlijke gegevens zijn niet offline beschikbaar.",
          });

        } finally {
          pending.current =
            false;
        }
      },
      [],
    );


  useEffect(() => {
    void load();

    const timer =
      window.setInterval(
        () => {
          if (
            document.visibilityState ===
            "visible"
          ) {
            void load();
          }
        },
        60000,
      );

    window.addEventListener(
      "focus",
      load,
    );

    return () => {
      window.clearInterval(
        timer,
      );

      window.removeEventListener(
        "focus",
        load,
      );
    };
  }, [load]);


  if (
    state.kind ===
    "login"
  ) {
    return <PersonalLogin />;
  }


  if (
    state.kind ===
    "mfa"
  ) {
    return (
      <Mfa
        onComplete={load}
      />
    );
  }


  if (
    state.kind ===
    "portal"
  ) {
    return (
      <PersonalPortal
        displayName={
          state.context
            .profile
            .display_name
        }
      />
    );
  }


  return (
    <main className="login">

      <section className="login-panel">

        <div className="login-box">

          <h1>
            Mijn Bestemming
          </h1>

          <p role="status">
            {state.kind ===
            "loading"
              ? "Uw persoonlijke sessie wordt gecontroleerd…"
              : state.message}
          </p>

          {state.kind ===
            "error" && (
            <>
              <button
                className="btn primary"
                onClick={load}
              >
                Opnieuw proberen
              </button>

              <Logout />
            </>
          )}

        </div>

      </section>

    </main>
  );
}
