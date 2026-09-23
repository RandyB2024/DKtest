import crypto from 'node:crypto';

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(p => p.length === 2));
}

export function signedSessionCookie(id, secret) {
  const signature = crypto.createHmac('sha256', secret).update(id).digest('base64url');
  return `${id}.${signature}`;
}

export function verifySessionCookie(value, secret) {
  if (!value) return null;
  const [id, signature] = value.split('.');
  if (!id || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(id).digest('base64url');
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

export function securityHeaders(isProduction) {
  return {
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(isProduction ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}
