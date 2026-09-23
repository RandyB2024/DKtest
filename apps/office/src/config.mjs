const boolean = (value, fallback = false) => value == null ? fallback : value === "true";
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const allowDevelopmentAuth = boolean(env.ALLOW_DEVELOPMENT_AUTH, nodeEnv !== "production");

  if (nodeEnv === "production" && allowDevelopmentAuth) {
    throw new Error("Veiligheidsstop: development-auth mag nooit actief zijn in productie.");
  }
  if (nodeEnv === "production" && (!env.SESSION_SECRET || env.SESSION_SECRET === "local-development-only")) {
    throw new Error("Veiligheidsstop: configureer een sterke SESSION_SECRET voor productie.");
  }

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === "production",
    allowDevelopmentAuth,
    port: number(env.PORT, 4173),
    sessionSecret: env.SESSION_SECRET || "local-development-only",
    idleMs: number(env.SESSION_IDLE_MINUTES, 15) * 60_000,
    stepUpMaxAgeMs: number(env.STEP_UP_MAX_AGE_MINUTES, 5) * 60_000,
  });
}
