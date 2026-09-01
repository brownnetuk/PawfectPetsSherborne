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

  // Upsert by token so re-registering the same device just refreshes it. A
  // token is either a staff token (`staff` set) or a customer token (`customer`
  // set) -- passing one unsets the other so a device that changes hands routes
  // correctly.
  async registerToken(
    token: string,
    platform: string,
    opts: { staff?: string; customer?: string } = {},
  ): Promise<void> {
    await this.pushTokenModel
      .updateOne(
        { token },
        {
          $set: {
            token,
            platform,
            staff: opts.staff ?? null,
            customer: opts.customer ?? null,
          },
        },
        { upsert: true },
      )
      .exec();
    const count = await this.pushTokenModel.countDocuments().exec();
    this.logger.log(
      `Registered ${opts.customer ? 'customer' : 'staff'} push token …${token.slice(-8)} (${count} total)`,
    );
  }

  countTokens(): Promise<number> {
    return this.pushTokenModel.countDocuments().exec();
  }

  removeToken(token: string): Promise<unknown> {
    return this.pushTokenModel.deleteOne({ token }).exec();
  }

  // Sends an alert to every STAFF device (customer-app tokens are excluded so
  // internal reminders never reach customers), under the staff apns-topic.
  async sendToAll(
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<{ sent: number; total: number; failures: { status: number; reason?: string }[] }> {
    if (!this.apns.configured) {
      this.logger.debug('APNs not configured; skipping push');
      return { sent: 0, total: 0, failures: [] };
    }
    // `customer: null` matches both null and missing (legacy staff tokens).
    const tokens = await this.pushTokenModel.find({ customer: null }).exec();
    return this.deliver(tokens, title, body, data, undefined);
  }

  // Sends an alert to a single customer's device(s), under the customer app's
  // apns-topic. No-op until APNS_CUSTOMER_BUNDLE_ID is configured.
  async sendToCustomer(
    customerId: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<{ sent: number; total: number; failures: { status: number; reason?: string }[] }> {
    if (!this.apns.customerConfigured) {
      this.logger.debug('Customer APNs topic not configured; skipping customer push');
      return { sent: 0, total: 0, failures: [] };
    }
    const topic = this.apns.topicFor('customer') ?? undefined;
    const tokens = await this.pushTokenModel.find({ customer: customerId }).exec();
    return this.deliver(tokens, title, body, data, topic);
  }

  // Shared delivery loop: sends to each token under `topic`, pruning any Apple
  // reports as no longer valid, and returns a summary.
  private async deliver(
    tokens: PushToken[],
    title: string,
    body: string,
    data: Record<string, unknown>,
    topic: string | undefined,
  ): Promise<{ sent: number; total: number; failures: { status: number; reason?: string }[] }> {
    this.logger.log(`Sending push "${title}" to ${tokens.length} device(s)`);
    let sent = 0;
    const failures: { status: number; reason?: string }[] = [];
    for (const t of tokens) {
      const result = await this.apns.send(t.token, title, body, data, topic);
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
