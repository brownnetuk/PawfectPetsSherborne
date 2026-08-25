import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import {
  buildItemsTableHtml,
  formatUkDate,
} from '../common/invoice-email.util';
import {
  formatDocumentNumber,
  nextSequenceNumber,
} from '../common/document-number.util';
import { publicApiUrl, trackingPixelHtml } from '../common/tracking-pixel.util';
import { Customer, CustomerStatus } from '../customers/schemas/customer.schema';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { Quote, QuoteStatus } from './schemas/quote.schema';

@Injectable()
export class QuotesService {
  constructor(
    @InjectModel(Quote.name) private readonly quoteModel: Model<Quote>,
    @InjectModel(BusinessInfo.name)
    private readonly businessInfoModel: Model<BusinessInfo>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private calculateTotals(
    lineItems: {
      quantity: number;
      unitPrice: number;
      discountPercent?: number;
    }[],
  ) {
    const subtotal = lineItems.reduce(
      (sum, item) =>
        sum +
        item.quantity *
          item.unitPrice *
          (1 - (item.discountPercent ?? 0) / 100),
      0,
    );
    return { subtotal, total: subtotal };
  }

  // Same atomic get-and-increment approach as InvoicesService.nextInvoiceNumber --
  // see nextSequenceNumber() for the full rationale.
  private async nextQuoteNumber(): Promise<string> {
    const seq = await nextSequenceNumber(
      this.businessInfoModel,
      'quoteNextNumber',
    );
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.quoteNumberTemplate || 'QUO-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  async create(dto: CreateQuoteDto, actor = 'Staff'): Promise<Quote> {
    if (!dto.customer && !(dto.manualCustomerName && dto.manualCustomerEmail)) {
      throw new BadRequestException(
        'A quote needs either a customer or a manual customer name and email.',
      );
    }
    const totals = this.calculateTotals(dto.lineItems);
    const quoteNumber = await this.nextQuoteNumber();
    const created = await new this.quoteModel({
      ...dto,
      quoteNumber,
      ...totals,
      status: QuoteStatus.DRAFT,
    }).save();
    // No customer to attach this to yet for a manual-customer quote -- see
    // resolveOrCreateCustomer(), called from update() once one's accepted.
    if (created.customer) {
      await this.auditLogService.record(
        created.customer,
        AuditEventType.QUOTE_CREATED,
        'Quote created',
        `${quoteNumber} created`,
        undefined,
        actor,
      );
    }
    return created;
  }

  // Called only when a manual-customer quote (customer absent,
  // manualCustomerName/Email set) is being marked accepted -- a real Customer
  // record shouldn't exist before then. Reuses an existing customer if the
  // manual email happens to already match one (case-insensitively, same
  // check as CustomersService.assertEmailNotTaken) rather than creating a
  // duplicate; otherwise creates a minimal "pending" record, the same shape
  // CustomersService.createLead() produces for a staff-sent registration
  // link.
  private async resolveOrCreateCustomer(quote: Quote): Promise<Types.ObjectId | undefined> {
    if (quote.customer) return quote.customer;
    if (!quote.manualCustomerName || !quote.manualCustomerEmail) return undefined;
    const existing = await this.customerModel
      .findOne({
        $expr: { $eq: [{ $toLower: '$email' }, quote.manualCustomerEmail.toLowerCase()] },
      })
      .exec();
    if (existing) return existing._id as Types.ObjectId;
    const created = await new this.customerModel({
      name: quote.manualCustomerName,
      email: quote.manualCustomerEmail,
      status: CustomerStatus.PENDING,
    }).save();
    return created._id as Types.ObjectId;
  }

  findAll(customerId?: string): Promise<Quote[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.quoteModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email address phoneNumber')
      .exec();
  }

  async findOne(id: string): Promise<Quote> {
    const quote = await this.quoteModel
      .findById(id)
      .populate('customer', 'name email address phoneNumber')
      .exec();
    if (!quote) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    return quote;
  }

  async update(
    id: string,
    dto: UpdateQuoteDto,
    actor = 'System',
  ): Promise<Quote> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.lineItems) {
      update.lineItems = dto.lineItems;
      Object.assign(update, this.calculateTotals(dto.lineItems));
    }
    // A manual-customer quote gets a real Customer record the moment it's
    // accepted -- never before (see resolveOrCreateCustomer() above).
    if (dto.status === QuoteStatus.ACCEPTED) {
      const current = await this.quoteModel.findById(id).exec();
      if (current && !current.customer) {
        const customerId = await this.resolveOrCreateCustomer(current);
        if (customerId) update.customer = customerId;
      }
    }
    const quote = await this.quoteModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email address phoneNumber')
      .exec();
    if (!quote) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    const customerId =
      (quote.customer as unknown as { _id?: unknown })?._id ?? quote.customer;
    if (customerId) {
      if (dto.status !== undefined) {
        await this.auditLogService.record(
          customerId as string,
          AuditEventType.QUOTE_UPDATED,
          'Status changed',
          `${quote.quoteNumber} status changed to ${dto.status}`,
          undefined,
          actor,
        );
      } else {
        await this.auditLogService.record(
          customerId as string,
          AuditEventType.QUOTE_UPDATED,
          'Quote updated',
          `${quote.quoteNumber} updated`,
          undefined,
          actor,
        );
      }
    }
    return quote;
  }

  async remove(id: string, actor = 'Staff'): Promise<void> {
    const result = await this.quoteModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    if (result.customer) {
      await this.auditLogService.record(
        result.customer,
        AuditEventType.QUOTE_REMOVED,
        'Quote removed',
        `${result.quoteNumber} removed`,
        undefined,
        actor,
      );
    }
  }

  /** Emails the quote to its customer (or manual-customer address) using the "Quote Template", then marks it sent if it was still a draft. */
  async sendEmail(id: string, actor = 'Staff'): Promise<Quote> {
    const quote = await this.findOne(id);
    const customer = quote.customer as unknown as
      | { _id?: unknown; name?: string; email?: string }
      | undefined;
    const recipientEmail = customer?.email ?? quote.manualCustomerEmail;
    const recipientName = customer?.name ?? quote.manualCustomerName;
    if (!recipientEmail) {
      throw new BadRequestException(
        'This customer has no email address on file.',
      );
    }
    const business = await this.businessInfoModel.findOne().exec();
    const pixelUrl = `${publicApiUrl()}/quotes/${id}/pixel.gif`;
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.QUOTE,
      recipientEmail,
      {
        customer_name: recipientName,
        subject: quote.subject,
        quote_number: quote.quoteNumber,
        quote_date: formatUkDate(quote.issueDate),
        valid_until: formatUkDate(quote.validUntil),
        subtotal: quote.subtotal.toFixed(2),
        total: quote.total.toFixed(2),
        bank_name: business?.bankName,
        sort_code: business?.sortCode,
        account_number: business?.accountNumber,
      },
      { items_table: buildItemsTableHtml(quote.lineItems) },
      trackingPixelHtml(pixelUrl),
    );
    if (customer?._id) {
      await this.auditLogService.record(
        customer._id as string,
        AuditEventType.QUOTE_EMAILED,
        'Quote emailed',
        `${quote.quoteNumber} emailed to ${recipientEmail}`,
        undefined,
        actor,
      );
    }
    if (quote.status === QuoteStatus.DRAFT) {
      return this.update(id, { status: QuoteStatus.SENT }, actor);
    }
    return quote;
  }

  /** First-open only -- called by the public GET /quotes/:id/pixel.gif when the sent email's tracking pixel loads. */
  async markOpened(id: string): Promise<void> {
    const quote = await this.quoteModel
      .findOneAndUpdate(
        { _id: id, openedAt: { $exists: false } },
        { openedAt: new Date() },
      )
      .exec();
    if (!quote || !quote.customer) return;
    await this.auditLogService.record(
      quote.customer,
      AuditEventType.QUOTE_READ,
      'Quote read',
      `${quote.quoteNumber} opened`,
      undefined,
      'Customer',
    );
  }
}
