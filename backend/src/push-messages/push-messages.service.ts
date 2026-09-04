import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PushService } from '../push/push.service';
import { CreatePushMessageDto } from './dto/create-push-message.dto';
import { PushMessage } from './schemas/push-message.schema';

const POPULATE = [
  { path: 'recipients.customer', select: 'name email' },
  { path: 'sentBy', select: 'name' },
];

@Injectable()
export class PushMessagesService {
  constructor(
    @InjectModel(PushMessage.name) private readonly pushMessageModel: Model<PushMessage>,
    private readonly push: PushService,
  ) {}

  findAll(): Promise<PushMessage[]> {
    return this.pushMessageModel.find().sort({ createdAt: -1 }).populate(POPULATE).exec();
  }

  // Sends to each customer in turn (small recipient counts for a business
  // this size -- no need for a background queue) and records a per-customer
  // received/not-received row from PushService's own delivery result before
  // persisting the whole send as one task.
  async send(dto: CreatePushMessageDto, staffId: string): Promise<PushMessage> {
    const ackRequired = dto.acknowledgementRequired ?? false;
    // Build the doc first so its id can travel in the push payload (the app
    // acknowledges against it).
    const message = new this.pushMessageModel({
      title: dto.title,
      body: dto.body,
      recipients: [],
      acknowledgementRequired: ackRequired,
      sentBy: staffId,
    });
    const recipients: {
      customer: string;
      status: 'received' | 'not_received';
      reason?: string;
    }[] = [];
    for (const customerId of dto.customerIds) {
      const result = await this.push.sendToCustomer(customerId, dto.title, dto.body, {
        type: 'broadcast',
        pushMessageId: String(message._id),
        ackRequired,
        title: dto.title,
        body: dto.body,
      });
      if (result.sent > 0) {
        recipients.push({ customer: customerId, status: 'received' });
      } else if (result.total === 0) {
        recipients.push({ customer: customerId, status: 'not_received', reason: 'No device registered' });
      } else {
        recipients.push({
          customer: customerId,
          status: 'not_received',
          reason: result.failures[0]?.reason ?? 'Delivery failed',
        });
      }
    }
    message.recipients = recipients as unknown as PushMessage['recipients'];
    await message.save();
    return message.populate(POPULATE);
  }

  // Marks a recipient's acknowledgedAt when the customer taps "Acknowledge".
  async acknowledge(id: string, customerId: string): Promise<{ ok: boolean }> {
    const message = await this.pushMessageModel.findById(id).exec();
    if (!message) throw new NotFoundException(`Push message ${id} not found`);
    const recipient = message.recipients.find((r) => String(r.customer) === customerId);
    if (recipient && !recipient.acknowledgedAt) {
      recipient.acknowledgedAt = new Date();
      await message.save();
    }
    return { ok: true };
  }

  // Removes a past send from the history list -- doesn't unsend the actual
  // push (already delivered or not), just the task record.
  async remove(id: string): Promise<void> {
    const result = await this.pushMessageModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Push message ${id} not found`);
    }
  }
}
