import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PushService } from '../push/push.service';
import { CustomerNotification } from './schemas/customer-notification.schema';

@Injectable()
export class CustomerNotificationsService {
  constructor(
    @InjectModel(CustomerNotification.name)
    private readonly model: Model<CustomerNotification>,
    private readonly push: PushService,
  ) {}

  // Persists a notification for the customer's app bell AND pushes it to their
  // device. Returns the push delivery summary (used by the admin test button).
  async record(
    customerId: string,
    title: string,
    body: string,
    type?: string,
    reference?: string,
  ) {
    const doc = await this.model.create({
      customer: customerId,
      title,
      body,
      type,
      reference,
      read: false,
    });
    // title/body are duplicated into the data payload so a tapped push can show
    // the notification in a modal without a round-trip.
    const result = await this.push.sendToCustomer(customerId, title, body, {
      type,
      reference,
      notificationId: String(doc._id),
      title,
      body,
    });
    return result;
  }

  list(customerId: string, limit = 50) {
    return this.model
      .find({ customer: customerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  unread(customerId: string): Promise<number> {
    return this.model.countDocuments({ customer: customerId, read: false }).exec();
  }

  async markAllRead(customerId: string) {
    await this.model
      .updateMany({ customer: customerId, read: false }, { read: true })
      .exec();
    return { ok: true };
  }
}
