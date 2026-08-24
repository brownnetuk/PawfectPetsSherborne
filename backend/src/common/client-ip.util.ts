import type { Request } from 'express';

// There's no nginx or other reverse proxy in front of this app (see README's
// "Deployment" section) -- public traffic arrives via a Cloudflare Tunnel,
// which sets CF-Connecting-IP to the real visitor IP on every request before
// it reaches this server. That header is the one to trust; req.ip/req.socket
// would just report cloudflared's own address. X-Forwarded-For is a fallback
// for local/dev use when there's no Cloudflare in front at all.
export function getClientIp(req: Request): string | undefined {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp) return cfIp;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? undefined;
}
