import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../customers/schemas/customer.schema';
import { NotificationService } from '../notifications/notification.service';
import { PushService } from '../push/push.service';
import { Message } from './schemas/message.schema';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly push: PushService,
    private readonly notifications: NotificationService,
  ) {}

  // --- staff (admin web + staff app) ---

  // One row per customer who has any messages: their name/email, the latest
  // message, and how many of their messages the staff haven't read yet.
  async listConversations() {
    return this.messageModel.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$customer',
          lastBody: { $first: '$body' },
          lastAt: { $first: '$createdAt' },
          lastSender: { $first: '$sender' },
          unread: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$sender', 'customer'] }, { $eq: ['$readByStaff', false] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      {
        $project: {
          _id: 0,
          customerId: '$_id',
          name: '$customer.name',
          email: '$customer.email',
          lastBody: 1,
          lastAt: 1,
          lastSender: 1,
          unread: 1,
        },
      },
      { $sort: { lastAt: -1 } },
    ]);
  }

  getThread(customerId: string) {
    return this.messageModel.find({ customer: customerId }).sort({ createdAt: 1 }).exec();
  }

  async staffUnreadTotal(): Promise<number> {
    return this.messageModel.countDocuments({ sender: 'customer', readByStaff: false }).exec();
  }

  private async markReadByStaff(customerId: string) {
    await this.messageModel
      .updateMany(
        { customer: customerId, sender: 'customer', readByStaff: false },
        { readByStaff: true },
      )
      .exec();
  }

  // Opens the thread for staff: marks the customer's messages read, returns all.
  async openThreadAsStaff(customerId: string) {
    await this.markReadByStaff(customerId);
    return this.getThread(customerId);
  }

  async staffSend(customerId: string, body: string, staffName: string) {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    const message = await this.messageModel.create({
      customer: customerId,
      sender: 'staff',
      senderName: staffName,
      body,
      readByStaff: true,
      readByCustomer: false,
    });
    // Push the customer's portal app (no-op unless configured/registered).
    await this.push.sendToCustomer(customerId, 'New message', body, { type: 'message' });
    return message;
  }

  // --- customer (portal app) ---

  private async markReadByCustomer(customerId: string) {
    await this.messageModel
      .updateMany(
        { customer: customerId, sender: 'staff', readByCustomer: false },
        { readByCustomer: true },
      )
      .exec();
  }

  async openThreadAsCustomer(customerId: string) {
    await this.markReadByCustomer(customerId);
    return this.getThread(customerId);
  }

  customerUnread(customerId: string): Promise<number> {
    return this.messageModel
      .countDocuments({ customer: customerId, sender: 'staff', readByCustomer: false })
      .exec();
  }

  async customerSend(customerId: string, body: string) {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    const message = await this.messageModel.create({
      customer: customerId,
      sender: 'customer',
      senderName: customer.name,
      body,
      readByStaff: false,
      readByCustomer: true,
    });
    // Notify staff (admin feed + push to staff devices).
    const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    await this.notifications.dispatch('New message', `${customer.name}: ${preview}`, 'message');
    return message;
  }
}
