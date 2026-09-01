import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as http2 from 'http2';

// Result of a single send so the caller can prune tokens Apple has retired.
export interface ApnsSendResult {
  ok: boolean;
  /** True when Apple says the token is no longer valid (410 / BadDeviceToken). */
  unregistered: boolean;
  status: number;
  reason?: string;
}

// Sends alert pushes to APNs over HTTP/2 using token-based (.p8) auth. No
// third-party dependency: the provider JWT is an ES256 token signed with
// Node's crypto, and delivery uses the built-in http2 client.
//
// Configured entirely from env (unset => disabled, so the app still runs):
//   APNS_KEY         the .p8 private key contents (PEM, or base64 of it;
//                    literal "\n" sequences are accepted for single-line env)
//   APNS_KEY_ID      the key's 10-char Key ID
//   APNS_TEAM_ID     the Apple Developer Team ID
//   APNS_BUNDLE_ID   the app bundle id (the apns-topic)
//   APNS_PRODUCTION  "true" => api.push.apple.com, else the sandbox host
@Injectable()
export class ApnsService {
  private readonly logger = new Logger(ApnsService.name);
  private readonly keyId = process.env.APNS_KEY_ID ?? '';
  private readonly teamId = process.env.APNS_TEAM_ID ?? '';
  private readonly bundleId = process.env.APNS_BUNDLE_ID ?? '';
  private readonly production = (process.env.APNS_PRODUCTION ?? 'true') === 'true';
  private readonly key = this.loadKey();

  // Cached provider JWT and when it was minted (Apple requires it be 20-60
  // minutes old; we re-mint every ~50 minutes).
  private cachedJwt?: string;
  private cachedAt = 0;

  // Rebuilds a valid PEM from APNS_KEY no matter how the env mangled it:
  // real newlines, literal "\n", spaces instead of newlines (common when a
  // .p8 gets pasted onto one line), or base64 of the whole file all work.
  private loadKey(): string | null {
    let raw = process.env.APNS_KEY?.trim();
    if (!raw) return null;
    if (!raw.includes('BEGIN')) {
      try {
        raw = Buffer.from(raw, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }
    const match = raw.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/);
    if (!match) return null;
    // Keep only base64 chars, then re-wrap at 64 columns as PEM requires.
    const body = match[1].replace(/[^A-Za-z0-9+/=]/g, '');
    if (!body) return null;
    const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
    return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
  }

  get configured(): boolean {
    return !!(this.key && this.keyId && this.teamId && this.bundleId);
  }

  private providerToken(): string {
    const now = Date.now();
    if (this.cachedJwt && now - this.cachedAt < 50 * 60 * 1000) return this.cachedJwt;
    const header = { alg: 'ES256', kid: this.keyId };
    const payload = { iss: this.teamId, iat: Math.floor(now / 1000) };
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const signingInput = `${b64(header)}.${b64(payload)}`;
    // ieee-p1363 gives the raw r||s signature JOSE (ES256) expects.
    const signature = crypto
      .createSign('SHA256')
      .update(signingInput)
      .sign({ key: this.key as string, dsaEncoding: 'ieee-p1363' })
      .toString('base64url');
    this.cachedJwt = `${signingInput}.${signature}`;
    this.cachedAt = now;
    return this.cachedJwt;
  }

  async send(
    deviceToken: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<ApnsSendResult> {
    if (!this.configured) {
      return { ok: false, unregistered: false, status: 0, reason: 'APNs not configured' };
    }
    const host = this.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    const payload = JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, ...data });

    return new Promise<ApnsSendResult>((resolve) => {
      const client = http2.connect(host);
      client.on('error', (err) => {
        this.logger.warn(`APNs connection error: ${err.message}`);
        resolve({ ok: false, unregistered: false, status: 0, reason: err.message });
      });
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.providerToken()}`,
        'apns-topic': this.bundleId,
        'apns-push-type': 'alert',
        'content-type': 'application/json',
      });
      let status = 0;
      let responseBody = '';
      req.on('response', (headers) => {
        status = Number(headers[':status']) || 0;
      });
      req.setEncoding('utf8');
      req.on('data', (chunk) => (responseBody += chunk));
      req.on('end', () => {
        client.close();
        let reason: string | undefined;
        try {
          reason = responseBody ? (JSON.parse(responseBody).reason as string) : undefined;
        } catch {
          // non-JSON body; leave reason undefined
        }
        const unregistered =
          status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic';
        resolve({ ok: status === 200, unregistered, status, reason });
      });
      req.write(payload);
      req.end();
    });
  }
}
