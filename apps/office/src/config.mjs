import {addressConfig} from './addresses.mjs';
import { passkeyConfig } from '../../shared/passkeys.mjs';
import { kvkConfig } from './kvk/client.mjs';
import { trustedMfaConfig } from './auth/trusted-mfa.mjs';
import { randomBytes } from 'node:crypto';

export function loadConfig(env = process.env) {
  trustedMfaConfig(env.MFA_TRUST_MAX_AGE_SECONDS);

  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const allowDevelopmentAuth = env.ALLOW_DEVELOPMENT_AUTH === 'true';

  if (isProduction && allowDevelopmentAuth) {
    throw new Error(
      'Veiligheidsstop: development-auth mag nooit actief zijn in productie.'
    );
  }

  if (
    allowDevelopmentAuth &&
    !['development','test'].includes(nodeEnv)
  ) {
    throw new Error(
      'Development-auth is alleen toegestaan in een expliciete lokale ontwikkelomgeving.'
    );
  }

  if (
    allowDevelopmentAuth &&
    (
      env.SUPABASE_URL ||
      env.SUPABASE_PUBLISHABLE_KEY
    )
  ) {
    throw new Error(
      'Veiligheidsstop: meng geen development-auth met Supabase-configuratie.'
    );
  }

  const port =
    Number(
      env.PORT ?? 4173
    );

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      'Ongeldige PORT.'
    );
  }

  const origin =
    env.OFFICE_ORIGIN ||
    (
      isProduction
        ? ''
        : `http://127.0.0.1:${port}`
    );

  try {
    const parsed =
      new URL(origin);

    if (
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password ||
      (
        isProduction &&
        parsed.protocol !== 'https:'
      ) ||
      (
        !isProduction &&
        !['http:','https:']
          .includes(
            parsed.protocol
          )
      )
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'Configureer OFFICE_ORIGIN als exacte origin; productie vereist HTTPS.'
    );
  }

  return Object.freeze({
    address:
      addressConfig(env),

    passkeys:
      passkeyConfig(env),

    kvk:
      kvkConfig(env),

    nodeEnv,
    isProduction,
    allowDevelopmentAuth,
    port,
    origin,

    supabaseUrl:
      env.SUPABASE_URL,

    supabaseKey:
      env.SUPABASE_PUBLISHABLE_KEY,

    supabaseServiceRoleKey:
      env.SUPABASE_SERVICE_ROLE_KEY || '',

    communicationEmailjs:
      Object.freeze({
        privateKey:
          env.EMAILJS_COMM_CUSTOMER_PRIVATE_KEY || '',
      }),

    emailjs:
      Object.freeze({
        serviceId:
          env.EMAILJS_SERVICE_ID || '',

        templateId:
          env.EMAILJS_TEMPLATE_ID || '',

        publicKey:
          env.EMAILJS_PUBLIC_KEY || '',

        privateKey:
          env.EMAILJS_PRIVATE_KEY || '',

        portalBaseUrl:
          env.PORTAL_BASE_URL || '',
      }),

    invoiceReminderEmailjs:
      Object.freeze({
        serviceId:
          env.EMAILJS_REMINDER_SERVICE_ID || '',

        templateId:
          env.EMAILJS_REMINDER_TEMPLATE_ID || '',

        publicKey:
          env.EMAILJS_REMINDER_PUBLIC_KEY || '',

        privateKey:
          env.EMAILJS_REMINDER_PRIVATE_KEY || '',
      }),

    creditEmailjs:
      Object.freeze({
        serviceId:
          env.EMAILJS_CREDIT_SERVICE_ID || '',

        templateId:
          env.EMAILJS_CREDIT_TEMPLATE_ID || '',

        publicKey:
          env.EMAILJS_CREDIT_PUBLIC_KEY || '',

        privateKey:
          env.EMAILJS_CREDIT_PRIVATE_KEY || '',
      }),

    // Legacy values are used only inside the explicitly local demo server.
    sessionSecret:
      allowDevelopmentAuth
        ? randomBytes(32)
            .toString('base64url')
        : undefined,

    idleMs:
      Number(
        env.SESSION_IDLE_MINUTES || 15
      ) * 60000,

    stepUpMaxAgeMs:
      Number(
        env.STEP_UP_MAX_AGE_MINUTES || 5
      ) * 60000,
  });
}