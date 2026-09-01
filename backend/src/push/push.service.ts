import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApnsService } from './apns.service';
import { PushToken } from './schemas/push-token.schema';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectModel(PushToken.name) private readonly pushTokenModel: Model<PushToken>,
    private readonly apns: ApnsService,
  ) {}

  get configured(): boolean {
    return this.apns.configured;
  }

  get diagnostics() {
    return this.apns.diagnostics;
  }

  // Upsert by token so re-registering the same device just refreshes it.
  async registerToken(token: string, platform: string, staff?: string): Promise<void> {
    await this.pushTokenModel
      .updateOne({ token }, { $set: { token, platform, staff } }, { upsert: true })
      .exec();
    const count = await this.pushTokenModel.countDocuments().exec();
    this.logger.log(
      `Registered push token …${token.slice(-8)} (${count} total; APNs configured=${this.apns.configured})`,
    );
  }

  countTokens(): Promise<number> {
    return this.pushTokenModel.countDocuments().exec();
  }

  removeToken(token: string): Promise<unknown> {
    return this.pushTokenModel.deleteOne({ token }).exec();
  }

  // Sends an alert to every registered device, pruning any Apple reports as
  // no longer valid. Returns a summary so diagnostics can surface the APNs
  // result. No-op when APNs isn't configured.
  async sendToAll(
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<{ sent: number; total: number; failures: { status: number; reason?: string }[] }> {
    if (!this.apns.configured) {
      this.logger.debug('APNs not configured; skipping push');
      return { sent: 0, total: 0, failures: [] };
    }
    const tokens = await this.pushTokenModel.find().exec();
    this.logger.log(`Sending push "${title}" to ${tokens.length} device(s)`);
    let sent = 0;
    const failures: { status: number; reason?: string }[] = [];
    for (const t of tokens) {
      const result = await this.apns.send(t.token, title, body, data);
      if (result.ok) {
        sent++;
      } else if (result.unregistered) {
        await this.removeToken(t.token);
        this.logger.log(`Pruned unregistered push token (${result.reason})`);
        failures.push({ status: result.status, reason: result.reason });
      } else {
        this.logger.warn(`Push send failed (status=${result.status} reason=${result.reason ?? 'n/a'})`);
        failures.push({ status: result.status, reason: result.reason });
      }
    }
    this.logger.log(`Push "${title}": ${sent}/${tokens.length} delivered`);
    return { sent, total: tokens.length, failures };
  }
}
