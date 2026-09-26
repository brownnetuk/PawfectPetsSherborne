import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '../customers/schemas/customer.schema';
import { EmailGroup } from '../email-groups/schemas/email-group.schema';
import { publicApiUrl, trackingPixelHtml } from '../common/tracking-pixel.util';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { SendEmailMessageDto } from './dto/send-email-message.dto';
import { EmailMessage } from './schemas/email-message.schema';

const POPULATE = [
  { path: 'recipients.customer', select: 'name email' },
  { path: 'sentBy', select: 'name' },
];

@Injectable()
export class EmailMessagesService {
  constructor(
    @InjectModel(EmailMessage.name) private readonly emailMessageModel: Model<EmailMessage>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(EmailGroup.name) private readonly emailGroupModel: Model<EmailGroup>,
    private readonly settingsService: SettingsService,
  ) {}

  findAll(): Promise<EmailMessage[]> {
    return this.emailMessageModel.find().sort({ createdAt: -1 }).populate(POPULATE).exec();
  }

  async findOne(id: string): Promise<EmailMessage> {
    const message = await this.emailMessageModel.findById(id).populate(POPULATE).exec();
    if (!message) {
      throw new NotFoundException(`Email ${id} not found`);
    }
    return message;
  }

  // Sends one individually-addressed email per recipient (never a single
  // BCC'd send) -- each customer only ever sees their own address, matching
  // the requested "customer details aren't shared" privacy, and each gets its
  // own tracking pixel so who specifically read it can be shown. Small
  // recipient counts for a business this size, same "no queue needed"
  // reasoning as PushMessagesService.send().
  async send(dto: SendEmailMessageDto, staffId: string): Promise<EmailMessage> {
    const customerIds = new Set(dto.customerIds ?? []);
    if (dto.groupIds?.length) {
      const groups = await this.emailGroupModel.find({ _id: { $in: dto.groupIds } }).exec();
      for (const group of groups) {
        for (const customerId of group.customers) customerIds.add(customerId.toString());
      }
    }
    if (customerIds.size === 0) {
      throw new BadRequestException('Select at least one customer or group to send to.');
    }
    const customers = await this.customerModel
      .find({ _id: { $in: [...customerIds] } })
      .select('name email')
      .exec();
    if (customers.length === 0) {
      throw new BadRequestException('None of the selected customers/groups could be found.');
    }

    const message = new this.emailMessageModel({
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      recipients: customers.map((c) => ({
        customer: c._id,
        email: c.email,
        name: c.name,
        status: 'sent' as const,
      })),
      sentBy: staffId,
    });
    await message.save();

    for (const recipient of message.recipients) {
      const pixelUrl = `${publicApiUrl()}/email-messages/${message._id}/recipients/${(
        recipient as unknown as { _id: { toString(): string } }
      )._id.toString()}/pixel.gif`;
      try {
        await this.settingsService.sendTemplatedEmail(
          EmailTrigger.GENERIC,
          recipient.email,
          { name: recipient.name, campaignSubject: dto.subject },
          { emailBodyText: dto.bodyHtml },
          trackingPixelHtml(pixelUrl),
        );
      } catch (err) {
        recipient.status = 'failed';
        recipient.reason = err instanceof Error ? err.message : 'Failed to send';
      }
    }
    await message.save();
    return message.populate(POPULATE);
  }

  // Marks a recipient's openedAt the first time their pixel fires -- same
  // first-open-only guard as AuditLogService.markOpened/InvoicesService.markOpened.
  async markOpened(messageId: string, recipientId: string): Promise<void> {
    await this.emailMessageModel
      .updateOne(
        { _id: messageId, 'recipients._id': recipientId, 'recipients.openedAt': { $exists: false } },
        { $set: { 'recipients.$.openedAt': new Date() } },
      )
      .exec();
  }

  async remove(id: string): Promise<void> {
    const result = await this.emailMessageModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Email ${id} not found`);
    }
  }
}
