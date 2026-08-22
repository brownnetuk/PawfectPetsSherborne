import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import {
  formatDocumentNumber,
  nextSequenceNumber,
} from '../common/document-number.util';
import { ExpensesService } from '../expenses/expenses.service';
import { InvoicesService } from '../invoices/invoices.service';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment } from './schemas/payment.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(BusinessInfo.name)
    private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly invoicesService: InvoicesService,
    private readonly auditLogService: AuditLogService,
    private readonly bankAccountsService: BankAccountsService,
    private readonly expensesService: ExpensesService,
  ) {}

  private async nextPaymentId(): Promise<string> {
    const seq = await nextSequenceNumber(
      this.businessInfoModel,
      'paymentNextNumber',
    );
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.paymentNumberTemplate || 'PAY-{year}-{seq}';
    return formatDocumentNumber(template, seq);
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
    const created = new this.paymentModel({ ...dto, paymentId, chargesExpense });
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
    );
    return saved;
  }

  findAll(): Promise<Payment[]> {
    return this.paymentModel
      .find()
      .sort({ date: -1, createdAt: -1 })
      .populate('invoice', 'invoiceNumber')
      .populate('account', 'name type')
      .exec();
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
    await this.bankAccountsService.adjustBalance(payment.account, -payment.amount);
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
      );
    }
  }
}
