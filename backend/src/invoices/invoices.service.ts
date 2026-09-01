import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { describeBlockers } from '../common/delete-guard.util';
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
import { CreditNote } from '../credit-notes/schemas/credit-note.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceStatus } from './schemas/invoice.schema';
import {
  buildInvoicePdfBuffer,
  PdfBusinessInfo,
  PdfInvoice,
} from './pdf/invoice-pdf.util';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
    @InjectModel(BusinessInfo.name)
    private readonly businessInfoModel: Model<BusinessInfo>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(CreditNote.name)
    private readonly creditNoteModel: Model<CreditNote>,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
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

  // Atomically reads the current invoiceNextNumber (creating the settings
  // singleton with defaults if it doesn't exist yet) and increments it in the
  // same operation, so two invoices created at once can never get the same
  // number -- the returned document is the state *before* the increment,
  // which is exactly the number this invoice should use.
  private async nextInvoiceNumber(): Promise<string> {
    const seq = await nextSequenceNumber(
      this.businessInfoModel,
      'invoiceNextNumber',
    );
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.invoiceNumberTemplate || 'INV-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  async create(dto: CreateInvoiceDto, actor = 'Staff'): Promise<Invoice> {
    const totals = this.calculateTotals(dto.lineItems);
    const invoiceNumber = await this.nextInvoiceNumber();
    const created = await new this.invoiceModel({
      ...dto,
      invoiceNumber,
      ...totals,
      status: InvoiceStatus.DRAFT,
    }).save();
    await this.auditLogService.record(
      created.customer,
      AuditEventType.INVOICE_CREATED,
      'Invoice created',
      `${invoiceNumber} created`,
      undefined,
      actor,
      undefined,
      undefined,
      created._id,
    );
    return created;
  }

  // Flips any invoice still sitting at "sent" past its due date to "overdue".
  // Runs hourly via @Cron so invoices go overdue in the background even if
  // nobody opens the app that day (self-hosted now, so no free-tier sleep to
  // work around). Also still called at the top of findAll() below so the
  // list is always correct the instant staff open it, rather than waiting
  // for the next hourly tick -- a plain conditional updateMany is cheap
  // enough to run on every list fetch too.
  @Cron(CronExpression.EVERY_HOUR)
  private async markOverdue(): Promise<void> {
    const filter = { status: InvoiceStatus.SENT, dueDate: { $lt: new Date() } };
    // Count what's about to flip so we only push when something actually goes
    // overdue (this also runs on every list fetch, and re-runs find nothing).
    const flipping = await this.invoiceModel.countDocuments(filter).exec();
    if (flipping === 0) return;
    await this.invoiceModel.updateMany(filter, { status: InvoiceStatus.OVERDUE }).exec();
    await this.notificationService.notifyInvoicesOverdue(flipping);
  }

  async findAll(customerId?: string): Promise<Invoice[]> {
    await this.markOverdue();
    const filter = customerId ? { customer: customerId } : {};
    return this.invoiceModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email address phoneNumber')
      .exec();
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceModel
      .findById(id)
      .populate('customer', 'name email address phoneNumber')
      .exec();
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }

  // Renders the invoice as a PDF using the same staff-designed template
  // (BusinessInfo.invoicePdfTemplate) the web apps use, so the mobile app can
  // download an identical document. Serialized via JSON so dates arrive as ISO
  // strings and the populated customer stays a plain object -- the same shape
  // the renderer sees in the browser.
  async renderPdf(id: string): Promise<Buffer> {
    const invoice = await this.findOne(id);
    const business = await this.settingsService.getBusinessInfo();
    const record = JSON.parse(JSON.stringify(invoice)) as PdfInvoice;
    const businessInfo = JSON.parse(JSON.stringify(business)) as PdfBusinessInfo;
    return buildInvoicePdfBuffer(record, businessInfo);
  }

  async update(
    id: string,
    dto: UpdateInvoiceDto,
    actor = 'System',
  ): Promise<Invoice> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.lineItems) {
      update.lineItems = dto.lineItems;
      Object.assign(update, this.calculateTotals(dto.lineItems));
    }
    if (dto.status === InvoiceStatus.PAID) {
      update.paidAt = new Date();
    }
    const invoice = await this.invoiceModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email address phoneNumber')
      .exec();
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    const customerId =
      (invoice.customer as unknown as { _id?: unknown })?._id ??
      invoice.customer;
    if (dto.status !== undefined) {
      await this.auditLogService.record(
        customerId as string,
        AuditEventType.INVOICE_UPDATED,
        'Status changed',
        `${invoice.invoiceNumber} status changed to ${dto.status}`,
        undefined,
        actor,
        undefined,
        undefined,
        id,
      );
    } else {
      await this.auditLogService.record(
        customerId as string,
        AuditEventType.INVOICE_UPDATED,
        'Invoice updated',
        `${invoice.invoiceNumber} updated`,
        undefined,
        actor,
        undefined,
        undefined,
        id,
      );
    }
    return invoice;
  }

  async remove(id: string, actor = 'Staff'): Promise<void> {
    const [paymentCount, creditNoteCount] = await Promise.all([
      this.paymentModel.countDocuments({ invoice: id }).exec(),
      this.creditNoteModel.countDocuments({ invoice: id }).exec(),
    ]);
    const blockers = describeBlockers({
      payment: paymentCount,
      'credit note': creditNoteCount,
    });
    if (blockers) {
      throw new ConflictException(
        `Can't delete this invoice: it has ${blockers} recorded against it. Remove those first.`,
      );
    }
    const result = await this.invoiceModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    await this.auditLogService.record(
      result.customer,
      AuditEventType.INVOICE_REMOVED,
      'Invoice removed',
      `${result.invoiceNumber} removed`,
      undefined,
      actor,
      undefined,
      undefined,
      result._id,
    );
  }

  /** Emails the invoice to its customer using the "Invoice Template", then marks it sent if it was still a draft. */
  async sendEmail(id: string, actor = 'Staff'): Promise<Invoice> {
    const invoice = await this.findOne(id);
    const customer = invoice.customer as unknown as {
      _id?: unknown;
      name?: string;
      email?: string;
      address?: string;
      phoneNumber?: string;
    };
    if (!customer?.email) {
      throw new BadRequestException(
        'This customer has no email address on file.',
      );
    }
    const business = await this.businessInfoModel.findOne().exec();
    const pixelUrl = `${publicApiUrl()}/invoices/${id}/pixel.gif`;
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.INVOICE,
      customer.email,
      {
        customer_name: customer.name,
        customer_address: customer.address,
        customer_phone: customer.phoneNumber,
        subject: invoice.subject,
        invoice_number: invoice.invoiceNumber,
        invoice_date: formatUkDate(invoice.issueDate),
        due_date: formatUkDate(invoice.dueDate),
        payment_terms: invoice.paymentTerms,
        subtotal: invoice.subtotal.toFixed(2),
        total: invoice.total.toFixed(2),
        invoice_link: `${publicFrontendUrl()}/invoices/${id}`,
        bank_name: business?.bankName,
        sort_code: business?.sortCode,
        account_number: business?.accountNumber,
      },
      { items_table: buildItemsTableHtml(invoice.lineItems) },
      trackingPixelHtml(pixelUrl),
    );
    await this.auditLogService.record(
      customer._id as string,
      AuditEventType.INVOICE_EMAILED,
      'Invoice emailed',
      `${invoice.invoiceNumber} emailed to ${customer.email}`,
      undefined,
      actor,
      undefined,
      undefined,
      id,
    );
    // Ping the customer's portal app that a new invoice has landed (no-op
    // unless they have the app and the customer APNs topic is configured).
    if (customer._id) {
      await this.notificationService.notifyCustomerDocumentReceived(
        String(customer._id),
        'invoice',
        invoice.invoiceNumber,
      );
    }
    if (invoice.status === InvoiceStatus.DRAFT) {
      return this.update(id, { status: InvoiceStatus.SENT }, actor);
    }
    return invoice;
  }

  /**
   * Emails a deposit request for this invoice, using Settings > Deposit's
   * configured percentage of the invoice total. Same pattern as
   * SettingsService.sendTriggeredEmail -- the "sent" entry embeds a tracking
   * pixel, and a paired "read" entry is created the first time it fires --
   * just against this invoice's own customer/amount rather than a generic
   * trigger.
   */
  async requestDeposit(
    id: string,
    actor = 'Staff',
  ): Promise<{ depositAmount: number; depositPercentage: number }> {
    const invoice = await this.findOne(id);
    const customer = invoice.customer as unknown as {
      _id?: unknown;
      name?: string;
      email?: string;
      address?: string;
      phoneNumber?: string;
    };
    if (!customer?.email) {
      throw new BadRequestException(
        'This customer has no email address on file.',
      );
    }
    const business = await this.settingsService.getBusinessInfo();
    const depositPercentage = business.depositPercentage;
    // Round via cents, not a plain decimal multiply, to avoid floating-point
    // drift landing a penny off (e.g. 33.33333...).
    const depositAmount = Math.round(invoice.total * depositPercentage) / 100;
    const remainingBalance = invoice.total - depositAmount;

    const entry = await this.auditLogService.record(
      customer._id as string,
      AuditEventType.DEPOSIT_REQUESTED,
      'Deposit requested',
      `£${depositAmount.toFixed(2)} (${depositPercentage}%) requested for ${invoice.invoiceNumber}`,
      undefined,
      actor,
      undefined,
      'Deposit request read',
      id,
    );
    const appendHtml = entry
      ? trackingPixelHtml(
          `${publicApiUrl()}/audit-log/${(entry._id as { toString(): string }).toString()}/pixel.gif`,
        )
      : '';

    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.DEPOSIT_REQUEST,
      customer.email,
      {
        customer_name: customer.name,
        customer_address: customer.address,
        customer_phone: customer.phoneNumber,
        invoice_number: invoice.invoiceNumber,
        invoice_total: invoice.total.toFixed(2),
        due_date: formatUkDate(invoice.dueDate),
        payment_terms: invoice.paymentTerms,
        deposit_percentage: String(depositPercentage),
        deposit_amount: depositAmount.toFixed(2),
        remaining_balance: remainingBalance.toFixed(2),
        invoice_link: `${publicFrontendUrl()}/invoices/${id}`,
        bank_name: business.bankName,
        sort_code: business.sortCode,
        account_number: business.accountNumber,
      },
      {},
      appendHtml,
    );

    // Same DRAFT -> SENT transition sendEmail() already does after a
    // successful send -- a deposit request is itself the first time this
    // invoice reaches the customer for a freshly-accepted quote, so it
    // shouldn't sit at "draft" once the email is on its way.
    if (invoice.status === InvoiceStatus.DRAFT) {
      await this.update(id, { status: InvoiceStatus.SENT }, actor);
    }

    return { depositAmount, depositPercentage };
  }

  /** First-open only -- called by the public GET /invoices/:id/pixel.gif when the sent email's tracking pixel loads. */
  async markOpened(id: string): Promise<void> {
    const invoice = await this.invoiceModel
      .findOneAndUpdate(
        { _id: id, openedAt: { $exists: false } },
        { openedAt: new Date() },
      )
      .exec();
    if (!invoice) return;
    await this.auditLogService.record(
      invoice.customer,
      AuditEventType.INVOICE_READ,
      'Invoice read',
      `${invoice.invoiceNumber} opened`,
      undefined,
      'Customer',
      undefined,
      undefined,
      invoice._id,
    );
    await this.notificationService.notifyInvoiceRead(invoice.invoiceNumber);
  }

  /** Adds a recorded payment's amount to amountPaid, flipping status to paid once it covers the total. */
  async applyPayment(id: string, amount: number): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(id).exec();
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    const amountPaid = (invoice.amountPaid ?? 0) + amount;
    const update: Record<string, unknown> = { amountPaid };
    if (amountPaid >= invoice.total) {
      update.status = InvoiceStatus.PAID;
      update.paidAt = new Date();
    }
    const updated = await this.invoiceModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email address phoneNumber')
      .exec();
    return updated!;
  }

  // Undoes applyPayment when the Payment record that caused it is deleted.
  // Reverts a since-flipped `paid` status back to `sent` rather than trying to
  // guess `overdue` -- markOverdue() re-flags it on the next list fetch if the
  // due date has in fact passed, so this doesn't need to duplicate that logic.
  async reversePayment(id: string, amount: number): Promise<void> {
    const invoice = await this.invoiceModel.findById(id).exec();
    if (!invoice) return;
    const amountPaid = Math.max(0, (invoice.amountPaid ?? 0) - amount);
    const revertingPaidStatus =
      invoice.status === InvoiceStatus.PAID && amountPaid < invoice.total;
    await this.invoiceModel
      .updateOne(
        { _id: id },
        {
          $set: {
            amountPaid,
            ...(revertingPaidStatus ? { status: InvoiceStatus.SENT } : {}),
          },
          ...(revertingPaidStatus ? { $unset: { paidAt: '' } } : {}),
        },
      )
      .exec();
  }
}
