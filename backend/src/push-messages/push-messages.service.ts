import { Injectable } from '@nestjs/common';
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
    const recipients: { customer: string; status: 'received' | 'not_received'; reason?: string }[] = [];
    for (const customerId of dto.customerIds) {
      const result = await this.push.sendToCustomer(customerId, dto.title, dto.body, { type: 'broadcast' });
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
    const created = await this.pushMessageModel.create({
      title: dto.title,
      body: dto.body,
      recipients,
      sentBy: staffId,
    });
    return created.populate(POPULATE);
  }
}
