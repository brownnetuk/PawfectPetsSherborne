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

  // Upsert by token so re-registering the same device just refreshes it.
  async registerToken(token: string, platform: string, staff?: string): Promise<void> {
    await this.pushTokenModel
      .updateOne({ token }, { $set: { token, platform, staff } }, { upsert: true })
      .exec();
  }

  removeToken(token: string): Promise<unknown> {
    return this.pushTokenModel.deleteOne({ token }).exec();
  }

  // Sends an alert to every registered device, pruning any Apple reports as
  // no longer valid. No-op (logged) when APNs isn't configured.
  async sendToAll(title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
    if (!this.apns.configured) {
      this.logger.debug('APNs not configured; skipping push');
      return;
    }
    const tokens = await this.pushTokenModel.find().exec();
    for (const t of tokens) {
      const result = await this.apns.send(t.token, title, body, data);
      if (result.unregistered) {
        await this.removeToken(t.token);
        this.logger.log(`Pruned unregistered push token (${result.reason})`);
      } else if (!result.ok) {
        this.logger.warn(`Push send failed (${result.status} ${result.reason ?? ''})`);
      }
    }
  }
}
