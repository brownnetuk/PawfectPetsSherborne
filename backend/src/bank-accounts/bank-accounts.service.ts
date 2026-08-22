import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreditNote } from '../credit-notes/schemas/credit-note.schema';
import { Expense } from '../expenses/schemas/expense.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { BankAccount } from './schemas/bank-account.schema';

export interface BankTransaction {
  date: Date;
  description: string;
  amount: number;
  balance: number;
  type: 'payment' | 'expense' | 'credit_note';
}

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectModel(BankAccount.name) private readonly bankAccountModel: Model<BankAccount>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
    @InjectModel(CreditNote.name) private readonly creditNoteModel: Model<CreditNote>,
  ) {}

  create(dto: CreateBankAccountDto): Promise<BankAccount> {
    return new this.bankAccountModel(dto).save();
  }

  findAll(): Promise<BankAccount[]> {
    return this.bankAccountModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: CreateBankAccountDto): Promise<BankAccount> {
    const account = await this.bankAccountModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!account) {
      throw new NotFoundException(`Bank account ${id} not found`);
    }
    return account;
  }

  async remove(id: string): Promise<void> {
    const result = await this.bankAccountModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Bank account ${id} not found`);
    }
  }

  // Shared by Payments/Expenses/CreditNotes so a bank account's balance stays
  // in sync with everything recorded against it -- $inc rather than
  // read-modify-write so concurrent adjustments can't race each other.
  async adjustBalance(id: string | Types.ObjectId, delta: number): Promise<void> {
    await this.bankAccountModel.updateOne({ _id: id }, { $inc: { currentBalance: delta } }).exec();
  }

  /**
   * The account's own statement for one calendar month: every Payment,
   * Expense, and CreditNote recorded against it, merged into a single
   * signed, running-balance ledger -- Payment credits (+), Expense and
   * CreditNote debits (-), same sign convention `adjustBalance` already uses
   * for each of them. `openingBalance` sums everything strictly before the
   * period so the running balance is meaningful without fetching the whole
   * account history every time.
   */
  async getTransactions(accountId: string, month: number, year: number) {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);
    const accountObjectId = new Types.ObjectId(accountId);

    const sumBefore = async <T>(model: Model<T>): Promise<number> => {
      const rows = await model
        .aggregate<{ total: number }>([
          { $match: { account: accountObjectId, date: { $lt: periodStart } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .exec();
      return rows[0]?.total ?? 0;
    };

    const [payments, expenses, creditNotes, paymentsBefore, expensesBefore, creditNotesBefore] =
      await Promise.all([
        this.paymentModel
          .find({ account: accountId, date: { $gte: periodStart, $lt: periodEnd } })
          .populate('invoice', 'invoiceNumber')
          .exec(),
        this.expenseModel
          .find({ account: accountId, date: { $gte: periodStart, $lt: periodEnd } })
          .exec(),
        this.creditNoteModel
          .find({ account: accountId, date: { $gte: periodStart, $lt: periodEnd } })
          .exec(),
        sumBefore(this.paymentModel),
        sumBefore(this.expenseModel),
        sumBefore(this.creditNoteModel),
      ]);

    const openingBalance = paymentsBefore - expensesBefore - creditNotesBefore;

    type UnbalancedTransaction = Omit<BankTransaction, 'balance'>;
    const unbalanced: UnbalancedTransaction[] = [
      ...payments.map((p): UnbalancedTransaction => {
        const invoice = p.invoice as unknown as { invoiceNumber?: string } | undefined;
        return {
          date: p.date,
          description: `Payment ${p.paymentId}${invoice?.invoiceNumber ? ` — ${invoice.invoiceNumber}` : ''}`,
          amount: p.amount,
          type: 'payment',
        };
      }),
      ...expenses.map((e): UnbalancedTransaction => ({
        date: e.date,
        description: e.description,
        amount: -e.amount,
        type: 'expense',
      })),
      ...creditNotes.map((c): UnbalancedTransaction => ({
        date: c.date,
        description: `Credit note ${c.creditNoteNumber} — ${c.reason}`,
        amount: -c.amount,
        type: 'credit_note',
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = openingBalance;
    const transactions: BankTransaction[] = unbalanced.map((t) => {
      running += t.amount;
      return { ...t, balance: running };
    });

    return { openingBalance, transactions };
  }
}
