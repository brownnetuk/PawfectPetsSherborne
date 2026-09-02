import {
  BadRequestException,
  ConflictException,
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
import {
  publicApiUrl,
  publicFrontendUrl,
  trackingPixelHtml,
} from '../common/tracking-pixel.util';
import { Customer, CustomerStatus } from '../customers/schemas/customer.schema';
import { InvoiceTerm } from '../invoice-terms/schemas/invoice-term.schema';
import { Invoice } from '../invoices/schemas/invoice.schema';
import { InvoicesService } from '../invoices/invoices.service';
import { NotificationService } from '../notifications/notification.service';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import {
  buildInvoicePdfBuffer,
  PdfBusinessInfo,
  PdfInvoice,
} from '../invoices/pdf/invoice-pdf.util';
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
    @InjectModel(InvoiceTerm.name) private readonly invoiceTermModel: Model<InvoiceTerm>,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly invoicesService: InvoicesService,
    private readonly notificationService: NotificationService,
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

  // Renders the quote as a PDF using the same template renderer as invoices
  // (kind 'quote'), so the mobile app can download an identical document.
  async renderPdf(id: string): Promise<Buffer> {
    const quote = await this.findOne(id);
    const business = await this.settingsService.getBusinessInfo();
    const record = JSON.parse(JSON.stringify(quote)) as PdfInvoice;
    const businessInfo = JSON.parse(JSON.stringify(business)) as PdfBusinessInfo;
    return buildInvoicePdfBuffer(record, businessInfo, 'quote');
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
      | { _id?: unknown; name?: string; email?: string; address?: string; phoneNumber?: string }
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
        customer_address: customer?.address,
        customer_phone: customer?.phoneNumber,
        subject: quote.subject,
        quote_number: quote.quoteNumber,
        quote_date: formatUkDate(quote.issueDate),
        valid_until: formatUkDate(quote.validUntil),
        payment_terms: quote.paymentTerms,
        subtotal: quote.subtotal.toFixed(2),
        total: quote.total.toFixed(2),
        quote_link: `${publicFrontendUrl()}/quotes/${id}`,
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
    // The customer's portal push fires on create/edit (see QuotesController),
    // so emailing doesn't push again here.
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

  // Mirrors DocumentFormModal.tsx's calculateDueDate() (admin frontend) --
  // there's no term picker on the public quote page, so this uses whichever
  // term staff have marked as default the same way the "New Invoice" form
  // pre-selects it, falling back to a plain 14 days if none is set.
  private async computeDefaultDueDate(issueDate: Date): Promise<string> {
    const defaultTerm = await this.invoiceTermModel.findOne({ isDefault: true }).exec();
    if (defaultTerm?.endOfMonth) {
      const lastDay = new Date(issueDate.getFullYear(), issueDate.getMonth() + 1, 0);
      const dow = lastDay.getDay(); // 0 = Sunday, 6 = Saturday
      if (dow === 0) lastDay.setDate(lastDay.getDate() - 2);
      else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1);
      return lastDay.toISOString().slice(0, 10);
    }
    const days = defaultTerm?.plusDays ?? 14;
    const due = new Date(issueDate);
    due.setDate(due.getDate() + days);
    return due.toISOString().slice(0, 10);
  }

  /**
   * Called from the public quote page's "Accept" button. Marks the quote
   * accepted (resolving/creating a real Customer first if it was still a
   * manual-customer quote -- see resolveOrCreateCustomer(), reused via
   * update()), converts it into a real Invoice with the same line items, and
   * immediately requests a deposit on that new invoice using Settings >
   * Deposit's configured percentage. Idempotent: re-accepting an
   * already-converted quote (e.g. a page refresh) returns the existing
   * invoice instead of creating a second one, and doesn't re-send the
   * deposit request.
   */
  async acceptAndConvert(
    id: string,
  ): Promise<{ invoice: Invoice; depositAmount?: number; depositPercentage?: number }> {
    const quote = await this.findOne(id);
    if (quote.status === QuoteStatus.DECLINED) {
      throw new ConflictException('This quote has already been declined.');
    }
    if (quote.status === QuoteStatus.EXPIRED) {
      throw new ConflictException('This quote has expired.');
    }
    if (quote.status === QuoteStatus.ACCEPTED && quote.invoice) {
      const existingInvoice = await this.invoicesService.findOne(quote.invoice.toString());
      return { invoice: existingInvoice };
    }
    const updated = await this.update(id, { status: QuoteStatus.ACCEPTED }, 'Customer');
    const customer = updated.customer as unknown as { _id?: unknown } | undefined;
    if (!customer?._id) {
      throw new BadRequestException('Could not resolve a customer for this quote.');
    }
    const issueDate = new Date();
    const dueDate = await this.computeDefaultDueDate(issueDate);
    const invoice = await this.invoicesService.create(
      {
        customer: (customer._id as { toString(): string }).toString(),
        booking: updated.booking ? (updated.booking as unknown as { toString(): string }).toString() : undefined,
        lineItems: updated.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          discountPercent: li.discountPercent,
        })),
        issueDate: issueDate.toISOString().slice(0, 10),
        dueDate,
        paymentTerms: updated.paymentTerms,
        subject: updated.subject,
      },
      'Customer',
    );
    await this.quoteModel.updateOne({ _id: id }, { invoice: invoice._id }).exec();
    // The quote-to-invoice conversion above is what actually matters to the
    // customer clicking "Accept" -- if the deposit-request email fails to
    // send (e.g. a misconfigured mail provider), that shouldn't make the
    // public accept action itself appear to fail, since the invoice was
    // already created successfully.
    try {
      const { depositAmount, depositPercentage } = await this.invoicesService.requestDeposit(
        (invoice._id as { toString(): string }).toString(),
        'Customer',
      );
      return { invoice, depositAmount, depositPercentage };
    } catch (err) {
      console.error(`Failed to send deposit request email after accepting quote ${id}:`, err);
      return { invoice };
    }
  }

  /** Called from the public quote page's "Reject" button. */
  async reject(id: string): Promise<Quote> {
    const quote = await this.findOne(id);
    if (quote.status === QuoteStatus.ACCEPTED) {
      throw new ConflictException('This quote has already been accepted.');
    }
    if (quote.status === QuoteStatus.DECLINED) {
      return quote;
    }
    return this.update(id, { status: QuoteStatus.DECLINED }, 'Customer');
  }
}
