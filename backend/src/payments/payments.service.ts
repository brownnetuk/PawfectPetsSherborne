import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import {
  formatDocumentNumber,
  nextSequenceNumber,
} from '../common/document-number.util';
import { formatUkDate } from '../common/invoice-email.util';
import { publicFrontendUrl } from '../common/tracking-pixel.util';
import { ExpensesService } from '../expenses/expenses.service';
import { Invoice } from '../invoices/schemas/invoice.schema';
import { InvoicesService } from '../invoices/invoices.service';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import {
  EmailTemplate,
  EmailTrigger,
} from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment } from './schemas/payment.schema';

// Seeded as the payment_received template on first start (see
// onModuleInit()), so the "Send a thank-you email?" prompt after recording a
// payment works out of the box -- staff can still edit it in Settings > Email
// Templates. Same card styling as the payment_overdue default.
const THANKS_CARD =
  'background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;';
const THANKS_ROW = 'padding:5px 0;';
const DEFAULT_THANKS_EMAIL_SUBJECT =
  'Thank you for your payment: invoice {{invoice_number}}';
const DEFAULT_THANKS_EMAIL_BODY = `<div style="max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<div style="background:#0f3a5f;color:#fff;padding:20px 24px;">
{{logo}}
<strong style="font-size:1.15rem;">{{businessName}}</strong>
</div>
<div style="padding:24px;background:#ffffff;">
<p style="margin:0 0 16px;">Hi {{customer_name}},</p>
<p style="margin:0 0 20px;">Thank you for your payment of <strong>£{{amount}}</strong> towards invoice <strong>{{invoice_number}}</strong>. It's been received and recorded on your account.</p>
<div style="${THANKS_CARD}padding:16px 20px;margin-bottom:20px;">
<table style="width:100%;border-collapse:collapse;font-size:14px;">
<tr><td style="${THANKS_ROW}color:#6b7280;">Invoice #</td><td style="${THANKS_ROW}text-align:right;font-weight:700;">{{invoice_number}}</td></tr>
<tr><td style="${THANKS_ROW}color:#6b7280;">Payment Date</td><td style="${THANKS_ROW}text-align:right;">{{payment_date}}</td></tr>
{{#if payment_method}}<tr><td style="${THANKS_ROW}color:#6b7280;">Payment Method</td><td style="${THANKS_ROW}text-align:right;">{{payment_method}}</td></tr>{{/if}}
<tr><td style="${THANKS_ROW}color:#6b7280;">Amount Paid</td><td style="${THANKS_ROW}text-align:right;font-weight:700;">£{{amount}}</td></tr>
<tr><td style="${THANKS_ROW}color:#6b7280;">Invoice Total</td><td style="${THANKS_ROW}text-align:right;">£{{total}}</td></tr>
<tr><td style="${THANKS_ROW}color:#6b7280;">Paid So Far</td><td style="${THANKS_ROW}text-align:right;">£{{amount_paid}}</td></tr>
{{#if balance_due}}<tr><td style="padding:8px 0 0;font-weight:700;border-top:1px solid #e5e7eb;">Balance Remaining</td><td style="padding:8px 0 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">£{{balance_due}}</td></tr>{{/if}}
{{#if paid_in_full}}<tr><td style="padding:8px 0 0;font-weight:700;border-top:1px solid #e5e7eb;">Balance Remaining</td><td style="padding:8px 0 0;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;color:#15803d;">Paid in full</td></tr>{{/if}}
</table>
</div>
{{#if balance_due}}<p style="margin:0 0 20px;">There's <strong>£{{balance_due}}</strong> left to pay on this invoice, due by {{due_date}}.</p>{{/if}}
<p style="margin:0 0 24px;"><a href="{{invoice_link}}" style="background:#0f3a5f;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;">View your invoice</a></p>
<p style="margin:0 0 16px;">If you have any questions, just reply to this email or call us on {{businessTelephone}}.</p>
<p style="margin:0;">Thanks again,<br>{{businessName}}</p>
</div>
</div>`;

@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(BusinessInfo.name)
    private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly invoicesService: InvoicesService,
    private readonly auditLogService: AuditLogService,
    private readonly bankAccountsService: BankAccountsService,
    private readonly expensesService: ExpensesService,
    private readonly settingsService: SettingsService,
    @InjectModel(EmailTemplate.name)
    private readonly emailTemplateModel: Model<EmailTemplate>,
  ) {}

  // Seeds the payment_received email template once (never overwriting staff
  // edits) -- same approach as InvoicesService.onModuleInit()'s
  // payment_overdue seed.
  async onModuleInit() {
    try {
      await this.emailTemplateModel
        .updateOne(
          { trigger: EmailTrigger.PAYMENT_RECEIVED },
          {
            $setOnInsert: {
              trigger: EmailTrigger.PAYMENT_RECEIVED,
              name: 'Thank You for Payment',
              subject: DEFAULT_THANKS_EMAIL_SUBJECT,
              body: DEFAULT_THANKS_EMAIL_BODY,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch {
      // Not fatal: staff can still set the template up by hand.
    }
  }

  private async nextPaymentId(): Promise<string> {
    const seq = await nextSequenceNumber(
      this.businessInfoModel,
      'paymentNextNumber',
    );
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.paymentNumberTemplate || 'PAY-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  // Shared by the auto-sent "Thank You" email on create() and the two
  // on-demand resend endpoints below, so all three stay in sync.
  private paymentEmailVars(
    payment: Payment,
    invoice: Invoice,
  ): Record<string, string | undefined> {
    const customer = invoice.customer as unknown as {
      name?: string;
      address?: string;
      phoneNumber?: string;
    };
    const amountPaid = invoice.amountPaid ?? 0;
    // Via cents, so float drift can't leave a phantom "£0.00 left to pay".
    const balanceDue = Math.round((invoice.total - amountPaid) * 100) / 100;
    return {
      customer_name: customer?.name,
      customer_address: customer?.address,
      customer_phone: customer?.phoneNumber,
      invoice_number: invoice.invoiceNumber,
      amount: payment.amount.toFixed(2),
      payment_date: formatUkDate(payment.date),
      due_date: formatUkDate(invoice.dueDate),
      total: invoice.total.toFixed(2),
      amount_paid: amountPaid.toFixed(2),
      balance_due: balanceDue > 0 ? balanceDue.toFixed(2) : undefined,
      paid_in_full: balanceDue > 0 ? undefined : 'yes',
      payment_method: payment.paymentMethod,
      invoice_link: `${publicFrontendUrl()}/invoices/${invoice._id}`,
    };
  }

  async create(dto: CreatePaymentDto, actor = 'Staff'): Promise<Payment> {
    const paymentId = await this.nextPaymentId();
    // Any processing charge becomes a real Expense (its own create() already
    // debits the account for us) rather than just being netted invisibly out
    // of the payment's own balance adjustment below -- that way it shows up
    // properly in the Expenses tab and Reports.
    let chargesExpense: Types.ObjectId | undefined;
    if (dto.charges) {
      const expense = await this.expensesService.create({
        date: dto.date,
        category: 'Payment Charges',
        description: `Processing charges on payment ${paymentId}`,
        amount: dto.charges,
        account: dto.account,
      });
      chargesExpense = expense._id;
    }
    const { skipThankYouEmail, ...paymentFields } = dto;
    const created = new this.paymentModel({
      ...paymentFields,
      paymentId,
      chargesExpense,
    });
    const saved = await created.save();
    // Deducts from the invoice's balance and flips it to paid once fully
    // covered -- see InvoicesService.applyPayment().
    const invoice = await this.invoicesService.applyPayment(
      dto.invoice,
      dto.amount,
    );
    // The full (gross) amount received -- the charge, if any, is already
    // accounted for separately via the linked expense above.
    await this.bankAccountsService.adjustBalance(dto.account, dto.amount);
    const customerId =
      (invoice.customer as unknown as { _id?: unknown })?._id ??
      invoice.customer;
    await this.auditLogService.record(
      customerId as string,
      AuditEventType.PAYMENT_RECEIVED,
      'Payment received',
      `£${dto.amount.toFixed(2)} received and applied to ${invoice.invoiceNumber}`,
      dto.amount,
      actor,
      undefined,
      undefined,
      dto.invoice,
    );
    // Best-effort "Thank You" email -- a missing template/customer email/Graph
    // failure must never undo an already-recorded payment, so this is never
    // allowed to throw back out of create().
    const customer = invoice.customer as unknown as {
      name?: string;
      email?: string;
      address?: string;
      phoneNumber?: string;
    };
    if (customer?.email && !skipThankYouEmail) {
      try {
        await this.settingsService.sendTemplatedEmail(
          EmailTrigger.PAYMENT_RECEIVED,
          customer.email,
          this.paymentEmailVars(saved, invoice),
        );
      } catch {
        // No template configured yet, or Graph is unreachable -- the payment
        // itself is already recorded, so swallow this rather than failing.
      }
    }
    return saved;
  }

  // Manual resend of the same "Thank You" email create() sends automatically
  // -- unlike there, failures propagate so the staff member who clicked the
  // button actually sees why it didn't go out.
  async sendReceivedEmail(id: string): Promise<void> {
    const payment = await this.paymentModel.findById(id).exec();
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    const invoice = await this.invoicesService.findOne(
      payment.invoice.toString(),
    );
    const customer = invoice.customer as unknown as { email?: string };
    if (!customer?.email) {
      throw new BadRequestException(
        'This customer has no email address on file.',
      );
    }
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.PAYMENT_RECEIVED,
      customer.email,
      this.paymentEmailVars(payment, invoice),
    );
  }

  // Same email/template as sendReceivedEmail, but with a client-built PDF
  // receipt attached (see admin/src/pdf/receiptPdf.ts) -- mirrors
  // CustomersService.sendRegistrationCopy's attachment pattern.
  async sendReceipt(
    id: string,
    attachment: { data: string; name: string },
  ): Promise<void> {
    const payment = await this.paymentModel.findById(id).exec();
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    const invoice = await this.invoicesService.findOne(
      payment.invoice.toString(),
    );
    const customer = invoice.customer as unknown as { email?: string };
    if (!customer?.email) {
      throw new BadRequestException(
        'This customer has no email address on file.',
      );
    }
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.PAYMENT_RECEIVED,
      customer.email,
      this.paymentEmailVars(payment, invoice),
      {},
      '',
      attachment,
    );
  }

  findAll(): Promise<Payment[]> {
    return this.paymentModel
      .find()
      .sort({ date: -1, createdAt: -1 })
      .populate('invoice', 'invoiceNumber')
      .populate('account', 'name type')
      .exec();
  }

  // Editing a payment reverses its existing side-effects (invoice balance,
  // account balance, linked charges expense) and then re-applies them with the
  // new values -- the same reverse-then-apply approach remove()/create() use,
  // so balances and `paid` status stay correct even if the invoice, amount or
  // account changed. No "Thank You" email is re-sent on an edit.
  async update(
    id: string,
    dto: UpdatePaymentDto,
    actor = 'Staff',
  ): Promise<Payment> {
    const payment = await this.paymentModel.findById(id).exec();
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    // 1. Reverse the existing payment's effects.
    if (payment.chargesExpense) {
      await this.expensesService.remove(payment.chargesExpense.toString());
      payment.chargesExpense = undefined;
    }
    await this.invoicesService.reversePayment(
      payment.invoice.toString(),
      payment.amount,
    );
    await this.bankAccountsService.adjustBalance(payment.account, -payment.amount);

    // 2. Resolve the new field values, falling back to the current ones.
    const invoiceId = dto.invoice ?? payment.invoice.toString();
    const date = dto.date ?? payment.date.toISOString();
    const amount = dto.amount ?? payment.amount;
    const account = dto.account ?? payment.account.toString();
    const charges = dto.charges !== undefined ? dto.charges : payment.charges;
    const paymentMethod =
      dto.paymentMethod !== undefined ? dto.paymentMethod : payment.paymentMethod;

    // 3. Re-create the linked charges expense if there is a charge.
    let chargesExpense: Types.ObjectId | undefined;
    if (charges) {
      const expense = await this.expensesService.create({
        date,
        category: 'Payment Charges',
        description: `Processing charges on payment ${payment.paymentId}`,
        amount: charges,
        account,
      });
      chargesExpense = expense._id;
    }

    // 4. Persist the new values.
    payment.invoice = new Types.ObjectId(invoiceId);
    payment.date = new Date(date);
    payment.amount = amount;
    payment.charges = charges ?? 0;
    payment.paymentMethod = paymentMethod;
    payment.account = new Types.ObjectId(account);
    payment.chargesExpense = chargesExpense;
    const saved = await payment.save();

    // 5. Apply the new effects.
    const invoice = await this.invoicesService.applyPayment(invoiceId, amount);
    await this.bankAccountsService.adjustBalance(account, amount);

    const customerId =
      (invoice.customer as unknown as { _id?: unknown })?._id ??
      invoice.customer;
    await this.auditLogService.record(
      customerId as string,
      AuditEventType.PAYMENT_RECEIVED,
      'Payment updated',
      `Payment ${payment.paymentId} updated — £${amount.toFixed(2)} applied to ${invoice.invoiceNumber}`,
      amount,
      actor,
      undefined,
      undefined,
      invoiceId,
    );
    return saved;
  }

  async remove(id: string, actor = 'Staff'): Promise<void> {
    const payment = await this.paymentModel.findByIdAndDelete(id).exec();
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    // Undoes the linked charges expense first (its own remove() reverses the
    // balance debit it caused), then the payment's own effects.
    if (payment.chargesExpense) {
      await this.expensesService.remove(payment.chargesExpense.toString());
    }
    // Undoes the balance deduction (and any resulting `paid` status) this
    // payment caused -- see InvoicesService.reversePayment().
    const invoiceId = payment.invoice.toString();
    await this.invoicesService.reversePayment(invoiceId, payment.amount);
    await this.bankAccountsService.adjustBalance(
      payment.account,
      -payment.amount,
    );
    const invoice = await this.invoicesService
      .findOne(invoiceId)
      .catch(() => null);
    if (invoice) {
      const customerId =
        (invoice.customer as unknown as { _id?: unknown })?._id ??
        invoice.customer;
      await this.auditLogService.record(
        customerId as string,
        AuditEventType.PAYMENT_REMOVED,
        'Payment removed',
        `£${payment.amount.toFixed(2)} payment removed from ${invoice.invoiceNumber}`,
        payment.amount,
        actor,
        undefined,
        undefined,
        invoiceId,
      );
    }
  }
}
