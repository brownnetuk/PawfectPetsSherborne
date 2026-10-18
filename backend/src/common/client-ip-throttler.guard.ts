import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { getClientIp } from './client-ip.util';

// ThrottlerGuard keys on req.ip by default, which behind the Cloudflare
// Tunnel is always cloudflared's own address -- so every visitor would share
// one bucket (5 code requests a minute for the whole business, and anyone
// could lock everyone else out). Key on the real visitor IP instead.
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(getClientIp(req as Request) ?? 'unknown');
  }
}
