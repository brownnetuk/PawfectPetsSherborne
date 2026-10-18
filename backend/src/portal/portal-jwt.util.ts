import * as crypto from 'crypto';

// The customer portal is a separate auth realm from staff. We derive its JWT
// signing secret from JWT_SECRET so a staff token can never validate as a
// customer token (different signature) and vice-versa — without needing an
// extra env var.
export function portalJwtSecret(jwtSecret: string): string {
  return crypto.createHash('sha256').update(`${jwtSecret}|portal`).digest('hex');
}

export const PORTAL_TOKEN_TTL = '90d';

// Web portal sessions are browser-held, so they're kept much shorter than the
// app's 90 days -- the customer just signs in again with a fresh code.
export const PORTAL_WEB_TOKEN_TTL = '12h';
