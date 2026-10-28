import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
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
import {
  EmailTemplate,
  EmailTrigger,
} from '../settings/schemas/email-template.schema';
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

// The latest due date that now counts as overdue: a full day before `now`.
// An invoice is on time throughout its due date and only goes overdue (and
// notifies staff and the customer) from the following day -- see
// markOverdue(). Exported for its unit test.
export function overdueCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

// Whole days between an invoice's due date and `now` (0 while it's still due
// today or in the future), counted on calendar days so the time of day either
// was recorded at doesn't matter. Exported for its unit test.
export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  const day = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(
    0,
    Math.round((day(now) - day(dueDate)) / (24 * 60 * 60 * 1000)),
  );
}

// Seeded as the payment_overdue template on first start (see onModuleInit()),
// so "Overdue Payment" works out of the box -- staff can still edit it in
// Settings > Email Templates. Same card styling as the admin's Invoice
// Template starter.
const OVERDUE_CARD =
  'background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;';
const OVERDUE_ROW = 'padding:5px 0;';
const DEFAULT_OVERDUE_EMAIL_SUBJECT =
  'Payment overdue: invoice {{invoice_number}} from {{businessName}}';
const DEFAULT_OVERDUE_EMAIL_BODY = `<div style="max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<div style="background:#0f3a5f;color:#fff;padding:20px 24px;">
{{logo}}
<strong style="font-size:1.15rem;">{{businessName}}</strong>
</div>
<div style="padding:24px;background:#ffffff;">
<p style="margin:0 0 16px;">Hi {{customer_name}},</p>
<p style="margin:0 0 16px;">We hope you and your pets are well. This is a friendly reminder that invoice <strong>{{invoice_number}}</strong> was due for payment on <strong>{{due_date}}</strong> and is now {{days_overdue}} day(s) overdue.</p>
<p style="margin:0 0 20px;">If you've already paid, thank you, and please ignore this email. Otherwise, we'd be grateful if you could settle the outstanding balance as soon as possible.</p>
<div style="${OVERDUE_CARD}padding:16px 20px;margin-bottom:20px;">
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Invoice #</td><td style="${OVERDUE_ROW}text-align:right;font-weight:700;">{{invoice_number}}</td></tr>
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Invoice Date</td><td style="${OVERDUE_ROW}text-align:right;">{{invoice_date}}</td></tr>
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Due Date</td><td style="${OVERDUE_ROW}text-align:right;">{{due_date}}</td></tr>
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Invoice Total</td><td style="${OVERDUE_ROW}text-align:right;">£{{invoice_total}}</td></tr>
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Paid So Far</td><td style="${OVERDUE_ROW}text-align:right;">£{{amount_paid}}</td></tr>
<tr><td style="padding:8px 0 0;font-weight:700;border-top:1px solid #e5e7eb;">Balance Due</td><td style="padding:8px 0 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;color:#b91c1c;">£{{balance_due}}</td></tr>
</table>
</div>
<p style="margin:0 0 24px;"><a href="{{invoice_link}}" style="background:#0f3a5f;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;">View your invoice</a></p>
{{#if bank_name}}<div style="${OVERDUE_CARD}padding:16px 20px;margin-bottom:20px;">
<div style="font-weight:700;margin-bottom:8px;">Payment Details</div>
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Bank Name</td><td style="${OVERDUE_ROW}text-align:right;">{{bank_name}}</td></tr>
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Sort Code</td><td style="${OVERDUE_ROW}text-align:right;">{{sort_code}}</td></tr>
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Account Number</td><td style="${OVERDUE_ROW}text-align:right;">{{account_number}}</td></tr>
<tr><td style="${OVERDUE_ROW}color:#6b7280;">Reference</td><td style="${OVERDUE_ROW}text-align:right;">{{invoice_number}}</td></tr>
</table>
</div>{{/if}}
<p style="margin:0 0 16px;">If there's a problem or you'd like to talk about payment, just reply to this email or call us on {{businessTelephone}}.</p>
<p style="margin:0;">Thanks,<br>{{businessName}}</p>
</div>
</div>`;

@Injectable()
export class InvoicesService implements OnModuleInit {
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
    @InjectModel(EmailTemplate.name)
    private readonly emailTemplateModel: Model<EmailTemplate>,
  ) {}

  // Seeds the payment_overdue email template once (never overwriting staff
  // edits) -- a deliberately deleted one isn't recreated until restart.
  async onModuleInit() {
    try {
      await this.emailTemplateModel
        .updateOne(
          { trigger: EmailTrigger.PAYMENT_OVERDUE },
          {
            $setOnInsert: {
              trigger: EmailTrigger.PAYMENT_OVERDUE,
              name: 'Payment Overdue',
              subject: DEFAULT_OVERDUE_EMAIL_SUBJECT,
              body: DEFAULT_OVERDUE_EMAIL_BODY,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch {
      // Not fatal: staff can still set the template up by hand.
    }
  }

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
    // No customer push on create: new invoices start as DRAFT. The customer is
    // notified only once the invoice becomes SENT (see update()).
    return created;
  }

  // Flips any invoice still sitting at "sent" to "overdue" once a full day has
  // passed since its due date -- the due date itself still counts as on
  // time, so an invoice due on the 20th shows (and notifies) as overdue from
  // the 21st, not from midnight on the 20th.
  // Runs hourly via @Cron so invoices go overdue in the background even if
  // nobody opens the app that day (self-hosted now, so no free-tier sleep to
  // work around). Also still called at the top of findAll() below so the
  // list is always correct the instant staff open it, rather than waiting
  // for the next hourly tick -- a plain conditional updateMany is cheap
  // enough to run on every list fetch too.
  @Cron(CronExpression.EVERY_HOUR)
  private async markOverdue(): Promise<void> {
    const filter = { status: InvoiceStatus.SENT, dueDate: { $lte: overdueCutoff() } };
    // Fetch the ones about to flip so we can push each owning customer (and
    // only notify staff when something actually goes overdue — this also runs
    // on every list fetch and usually finds nothing).
    const flipping = await this.invoiceModel
      .find(filter)
      .select('customer invoiceNumber')
      .exec();
    if (flipping.length === 0) return;
    await this.invoiceModel.updateMany(filter, { status: InvoiceStatus.OVERDUE }).exec();
    await this.notificationService.notifyInvoicesOverdue(flipping.length);
    for (const inv of flipping) {
      if (inv.customer) {
        await this.notificationService.notifyCustomerInvoiceStatus(
          String(inv.customer),
          inv.invoiceNumber,
          'overdue',
        );
      }
    }
  }

  async findAll(customerId?: string): Promise<Invoice[]> {
    await this.markOverdue();
    const filter = customerId ? { customer: customerId } : {};
    return this.invoiceModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email address phoneNumber')
      .populate('visitPlan.animals', 'name')
      .exec();
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceModel
      .findById(id)
      .populate('customer', 'name email address phoneNumber')
      .populate('visitPlan.animals', 'name')
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
    // Prior status, to decide whether to notify the customer (see below).
    const prior = await this.invoiceModel.findById(id).select('status').exec();
    const wasSent = prior?.status === InvoiceStatus.SENT;
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
    // Customer push (never for drafts):
    //  - becoming sent (e.g. draft -> sent on Send) -> "New invoice"
    //  - an edit to an already-sent invoice -> "Invoice updated"
    //  - a sent invoice moving to paid / overdue / cancelled -> a status push
    if (customerId) {
      const cid = String(customerId);
      if (invoice.status === InvoiceStatus.SENT) {
        await this.notificationService.notifyCustomerDocument(
          cid,
          'invoice',
          invoice.invoiceNumber,
          wasSent ? 'updated' : 'new',
        );
      } else if (
        wasSent &&
        (invoice.status === InvoiceStatus.PAID ||
          invoice.status === InvoiceStatus.OVERDUE ||
          invoice.status === InvoiceStatus.CANCELLED)
      ) {
        await this.notificationService.notifyCustomerInvoiceStatus(
          cid,
          invoice.invoiceNumber,
          invoice.status,
        );
      }
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
    // The customer's portal push fires on create/edit (see InvoicesController),
    // so emailing doesn't push again here.
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

  /**
   * Emails an overdue-payment reminder for the outstanding balance on this
   * invoice, using the payment_overdue template. Tracked the same way as
   * requestDeposit() -- an audit entry with a "read" pixel -- and leaves the
   * invoice's status alone.
   */
  async sendOverdueReminder(
    id: string,
    actor = 'Staff',
  ): Promise<{ balanceDue: number; daysOverdue: number }> {
    const invoice = await this.findOne(id);
    if (
      invoice.status === InvoiceStatus.PAID ||
      invoice.status === InvoiceStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Invoice ${invoice.invoiceNumber} is ${invoice.status}, so there's nothing overdue to chase.`,
      );
    }
    const amountPaid = invoice.amountPaid ?? 0;
    // Via cents, same as requestDeposit(), so float drift can't leave a
    // phantom penny outstanding.
    const balanceDue = Math.round((invoice.total - amountPaid) * 100) / 100;
    if (balanceDue <= 0) {
      throw new BadRequestException(
        `Invoice ${invoice.invoiceNumber} has no outstanding balance.`,
      );
    }
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
    const overdueDays = daysOverdue(invoice.dueDate);

    const entry = await this.auditLogService.record(
      customer._id as string,
      AuditEventType.OVERDUE_REMINDER_SENT,
      'Overdue payment reminder sent',
      `£${balanceDue.toFixed(2)} outstanding on ${invoice.invoiceNumber} (${overdueDays} day(s) overdue)`,
      undefined,
      actor,
      undefined,
      'Overdue payment reminder read',
      id,
    );
    const appendHtml = entry
      ? trackingPixelHtml(
          `${publicApiUrl()}/audit-log/${(entry._id as { toString(): string }).toString()}/pixel.gif`,
        )
      : '';

    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.PAYMENT_OVERDUE,
      customer.email,
      {
        customer_name: customer.name,
        customer_address: customer.address,
        customer_phone: customer.phoneNumber,
        invoice_number: invoice.invoiceNumber,
        invoice_date: formatUkDate(invoice.issueDate),
        due_date: formatUkDate(invoice.dueDate),
        days_overdue: String(overdueDays),
        payment_terms: invoice.paymentTerms,
        invoice_total: invoice.total.toFixed(2),
        amount_paid: amountPaid.toFixed(2),
        balance_due: balanceDue.toFixed(2),
        invoice_link: `${publicFrontendUrl()}/invoices/${id}`,
        bank_name: business.bankName,
        sort_code: business.sortCode,
        account_number: business.accountNumber,
      },
      {},
      appendHtml,
    );

    return { balanceDue, daysOverdue: overdueDays };
  }

  /**
   * Same as requestDeposit() above but for the full balance -- used when
   * staff choose "Request full payment" on a Boarding & Day Care booking
   * instead of a deposit. Reuses the same DEPOSIT_REQUEST email
   * trigger/template (deposit_percentage reads "100" and deposit_amount is
   * the full total) rather than adding a second template just for this.
   */
  async requestFullPayment(
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
    const depositAmount = invoice.total;

    const entry = await this.auditLogService.record(
      customer._id as string,
      AuditEventType.DEPOSIT_REQUESTED,
      'Full payment requested',
      `£${depositAmount.toFixed(2)} (full balance) requested for ${invoice.invoiceNumber}`,
      undefined,
      actor,
      undefined,
      'Payment request read',
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
        deposit_percentage: '100',
        deposit_amount: depositAmount.toFixed(2),
        remaining_balance: '0.00',
        invoice_link: `${publicFrontendUrl()}/invoices/${id}`,
        bank_name: business.bankName,
        sort_code: business.sortCode,
        account_number: business.accountNumber,
      },
      {},
      appendHtml,
    );

    if (invoice.status === InvoiceStatus.DRAFT) {
      await this.update(id, { status: InvoiceStatus.SENT }, actor);
    }

    return { depositAmount, depositPercentage: 100 };
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
  // `notify: false` is for the Recycle Bin putting a deleted payment back --
  // the customer was already told the invoice was paid the first time.
  async applyPayment(id: string, amount: number, { notify = true } = {}): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(id).exec();
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    const amountPaid = (invoice.amountPaid ?? 0) + amount;
    const update: Record<string, unknown> = { amountPaid };
    const justPaid = invoice.status !== InvoiceStatus.PAID && amountPaid >= invoice.total;
    if (amountPaid >= invoice.total) {
      update.status = InvoiceStatus.PAID;
      update.paidAt = new Date();
    }
    const updated = await this.invoiceModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email address phoneNumber')
      .exec();
    if (notify && justPaid && updated) {
      const cid = (updated.customer as unknown as { _id?: unknown })?._id ?? updated.customer;
      if (cid) {
        await this.notificationService.notifyCustomerInvoiceStatus(
          String(cid),
          updated.invoiceNumber,
          'paid',
        );
      }
    }
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
