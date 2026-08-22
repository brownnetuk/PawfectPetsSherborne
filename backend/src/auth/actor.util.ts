import type { Request } from 'express';

// Best-effort, unverified actor label for audit-log display only -- NOT a
// security check. Used only on the two @Public() customer routes (the public
// intake form calls the same routes the admin app's staff-initiated edits
// use), where @Public() short-circuits JwtAuthGuard before Passport ever
// runs, so req.user is never populated even when the admin app sends a valid
// staff JWT. Decodes the JWT payload's `name` claim without checking the
// signature/expiry -- a forged token here only produces a wrong-but-harmless
// display name, since nothing on these routes grants permissions based on it.
export function actorFromRequest(req: Request): string {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return 'Customer';
  try {
    const payload = JSON.parse(
      Buffer.from(header.split('.')[1], 'base64url').toString('utf8'),
    ) as {
      name?: string;
    };
    return payload.name || 'Staff';
  } catch {
    return 'Customer';
  }
}
