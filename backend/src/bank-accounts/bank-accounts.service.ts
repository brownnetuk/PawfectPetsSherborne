import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BankTransfer } from '../bank-transfers/schemas/bank-transfer.schema';
import { describeBlockers } from '../common/delete-guard.util';
import { CreditNote } from '../credit-notes/schemas/credit-note.schema';
import { Expense } from '../expenses/schemas/expense.schema';
import { OtherIncome } from '../other-income/schemas/other-income.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';
import { BankAccount } from './schemas/bank-account.schema';

export interface BankTransaction {
  date: Date;
  description: string;
  amount: number;
  balance: number;
  type: 'payment' | 'other_income' | 'expense' | 'credit_note' | 'bank_transfer';
  // Statement-style fields for the Financial > Bank Accounts tab: `label` is
  // the row's headline ("Customer Payment", an expense's category...),
  // `party` the "Customer: ..." / "Payee: ..." subline, and `reference` the
  // payment ID, invoice/credit note number or the reference typed in.
  label: string;
  party?: string;
  reference?: string;
}

// One period of an account's statement: `from` inclusive, `to` exclusive;
// either end left out means open-ended (from the account's reconciliation
// anchor, or up to now).
export interface StatementRange {
  from?: Date;
  to?: Date;
}

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectModel(BankAccount.name)
    private readonly bankAccountModel: Model<BankAccount>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
    @InjectModel(CreditNote.name)
    private readonly creditNoteModel: Model<CreditNote>,
    @InjectModel(BankTransfer.name)
    private readonly bankTransferModel: Model<BankTransfer>,
    @InjectModel(OtherIncome.name)
    private readonly otherIncomeModel: Model<OtherIncome>,
  ) {}

  async create(dto: CreateBankAccountDto): Promise<BankAccount> {
    if (dto.isDefault) {
      await this.clearOtherDefaults();
    }
    return new this.bankAccountModel(dto).save();
  }

  findAll(): Promise<BankAccount[]> {
    return this.bankAccountModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: CreateBankAccountDto): Promise<BankAccount> {
    if (dto.isDefault) {
      await this.clearOtherDefaults(id);
    }
    const account = await this.bankAccountModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!account) {
      throw new NotFoundException(`Bank account ${id} not found`);
    }
    return account;
  }

  // Only one account can be the default at a time -- unset it on every other
  // account before the caller sets it on theirs, same reasoning as
  // PaymentMethodsService.clearOtherDefaults.
  private async clearOtherDefaults(exceptId?: string): Promise<void> {
    const filter = exceptId ? { _id: { $ne: exceptId } } : {};
    await this.bankAccountModel.updateMany(filter, { isDefault: false }).exec();
  }

  async remove(id: string): Promise<void> {
    const [paymentCount, otherIncomeCount, expenseCount, creditNoteCount] = await Promise.all([
      this.paymentModel.countDocuments({ account: id }).exec(),
      this.otherIncomeModel.countDocuments({ account: id }).exec(),
      this.expenseModel.countDocuments({ account: id }).exec(),
      this.creditNoteModel.countDocuments({ account: id }).exec(),
    ]);
    const blockers = describeBlockers({
      payment: paymentCount,
      'other income entry': otherIncomeCount,
      expense: expenseCount,
      'credit note': creditNoteCount,
    });
    if (blockers) {
      throw new ConflictException(
        `Can't delete this bank account: it has ${blockers} recorded against it. Remove those first.`,
      );
    }
    const result = await this.bankAccountModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Bank account ${id} not found`);
    }
  }

  // Shared by Payments/Expenses/CreditNotes so a bank account's balance stays
  // in sync with everything recorded against it -- $inc rather than
  // read-modify-write so concurrent adjustments can't race each other.
  async adjustBalance(
    id: string | Types.ObjectId,
    delta: number,
  ): Promise<void> {
    await this.bankAccountModel
      .updateOne({ _id: id }, { $inc: { currentBalance: delta } })
      .exec();
  }

  // Sums a Payment/Expense/CreditNote model's `amount` for one account from
  // `from` (inclusive) up to `to` if given, otherwise open-ended -- matches
  // the $gte/$lt convention getTransactions() already uses for a calendar
  // month.
  private async sumBetween<T>(
    model: Model<T>,
    accountId: Types.ObjectId,
    from: Date,
    to?: Date,
  ): Promise<number> {
    const rows = await model
      .aggregate<{ total: number }>([
        {
          $match: {
            account: accountId,
            date: { $gte: from, ...(to ? { $lt: to } : {}) },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .exec();
    return rows[0]?.total ?? 0;
  }

  // Same rolling-window sum as sumBetween(), but for BankTransfer -- unlike
  // Payment/Expense/CreditNote (which only ever debit or credit a single
  // `account` field), a transfer touches two accounts with opposite signs
  // depending on which side this account is on, so it needs its own signed
  // aggregation rather than a plain $sum of `amount`.
  private async sumTransfersBetween(
    accountId: Types.ObjectId,
    from: Date,
    to?: Date,
  ): Promise<number> {
    const rows = await this.bankTransferModel
      .aggregate<{ total: number }>([
        {
          $match: {
            $or: [{ fromAccount: accountId }, { toAccount: accountId }],
            date: { $gte: from, ...(to ? { $lt: to } : {}) },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [{ $eq: ['$fromAccount', accountId] }, { $multiply: ['$amount', -1] }, '$amount'],
              },
            },
          },
        },
      ])
      .exec();
    return rows[0]?.total ?? 0;
  }

  /**
   * Reconciles the account against a real statement: "as of `date`, the
   * balance was `balance`". Becomes the new anchor getTransactions() sums
   * forward from, and `currentBalance` is recomputed from scratch (not
   * incremented) as `balance` plus everything recorded from `date` onward --
   * this is the one place a stray-adjustment drift (e.g. from deleting a
   * payment that predated adjustBalance existing) can be corrected without
   * touching the underlying transaction records themselves.
   */
  async setOpeningBalance(
    id: string,
    dto: SetOpeningBalanceDto,
  ): Promise<BankAccount> {
    const openingBalanceDate = new Date(dto.date);
    const accountObjectId = new Types.ObjectId(id);
    const [paymentsSince, otherIncomeSince, expensesSince, creditNotesSince, transfersSince] = await Promise.all([
      this.sumBetween(this.paymentModel, accountObjectId, openingBalanceDate),
      this.sumBetween(this.otherIncomeModel, accountObjectId, openingBalanceDate),
      this.sumBetween(this.expenseModel, accountObjectId, openingBalanceDate),
      this.sumBetween(
        this.creditNoteModel,
        accountObjectId,
        openingBalanceDate,
      ),
      this.sumTransfersBetween(accountObjectId, openingBalanceDate),
    ]);
    const currentBalance =
      dto.balance + paymentsSince + otherIncomeSince - expensesSince - creditNotesSince + transfersSince;
    const account = await this.bankAccountModel
      .findByIdAndUpdate(
        id,
        { openingBalanceDate, openingBalance: dto.balance, currentBalance },
        { new: true },
      )
      .exec();
    if (!account) {
      throw new NotFoundException(`Bank account ${id} not found`);
    }
    return account;
  }

  /**
   * The account's own statement for one period: every Payment, OtherIncome,
   * Expense, CreditNote, and BankTransfer recorded against it, merged into a
   * single signed, running-balance ledger -- Payment and OtherIncome credit
   * (+), Expense and CreditNote debit (-), same sign convention
   * `adjustBalance` already uses for each of them; a BankTransfer credits (+)
   * when this account is the destination and debits (-) when it's the
   * source. The period's own opening balance sums from the account's
   * reconciliation anchor (openingBalanceDate/openingBalance, see
   * setOpeningBalance() -- defaults to account creation / £0 if never
   * reconciled) rather than from the beginning of time, so it stays correct
   * even when older, now-superseded transaction history exists before it.
   * A period with no `from` starts at that anchor.
   */
  async getTransactions(accountId: string, range: StatementRange) {
    const account = await this.bankAccountModel.findById(accountId).exec();
    if (!account) {
      throw new NotFoundException(`Bank account ${accountId} not found`);
    }
    const createdAt = (account as unknown as { createdAt: Date }).createdAt;
    const anchorDate = account.openingBalanceDate ?? createdAt;
    const anchorBalance = account.openingBalance ?? 0;

    const periodStart = range.from ?? anchorDate;
    const dateFilter = { $gte: periodStart, ...(range.to ? { $lt: range.to } : {}) };
    const accountObjectId = new Types.ObjectId(accountId);

    const [
      payments,
      otherIncome,
      expenses,
      creditNotes,
      transfers,
      paymentsBefore,
      otherIncomeBefore,
      expensesBefore,
      creditNotesBefore,
      transfersBefore,
    ] = await Promise.all([
      this.paymentModel
        .find({ account: accountId, date: dateFilter })
        .populate({
          path: 'invoice',
          select: 'invoiceNumber customer',
          populate: { path: 'customer', select: 'name firstName surname' },
        })
        .exec(),
      this.otherIncomeModel.find({ account: accountId, date: dateFilter }).exec(),
      this.expenseModel.find({ account: accountId, date: dateFilter }).exec(),
      this.creditNoteModel
        .find({ account: accountId, date: dateFilter })
        .populate('customer', 'name firstName surname')
        .exec(),
      this.bankTransferModel
        .find({
          $or: [{ fromAccount: accountId }, { toAccount: accountId }],
          date: dateFilter,
        })
        .populate('fromAccount', 'name')
        .populate('toAccount', 'name')
        .exec(),
      this.sumBetween(this.paymentModel, accountObjectId, anchorDate, periodStart),
      this.sumBetween(this.otherIncomeModel, accountObjectId, anchorDate, periodStart),
      this.sumBetween(this.expenseModel, accountObjectId, anchorDate, periodStart),
      this.sumBetween(this.creditNoteModel, accountObjectId, anchorDate, periodStart),
      this.sumTransfersBetween(accountObjectId, anchorDate, periodStart),
    ]);

    const openingBalance =
      anchorBalance + paymentsBefore + otherIncomeBefore - expensesBefore - creditNotesBefore + transfersBefore;

    type UnbalancedTransaction = Omit<BankTransaction, 'balance'>;
    const unbalanced: UnbalancedTransaction[] = [
      ...payments.map((p): UnbalancedTransaction => {
        const invoice = p.invoice as unknown as
          { invoiceNumber?: string; customer?: CustomerNameFields | null } | null | undefined;
        const customer = customerName(invoice?.customer);
        return {
          date: p.date,
          description: `Payment ${p.paymentId}${invoice?.invoiceNumber ? ` — ${invoice.invoiceNumber}` : ''}`,
          amount: p.amount,
          type: 'payment',
          label: 'Customer Payment',
          party: customer ? `Customer: ${customer}` : undefined,
          reference: [invoice?.invoiceNumber, p.paymentId].filter(Boolean).join(' · '),
        };
      }),
      ...otherIncome.map((o): UnbalancedTransaction => ({
        date: o.date,
        description: `Other income — ${o.receivedFrom}${o.description ? ` — ${o.description}` : ''}`,
        amount: o.amount,
        type: 'other_income',
        label: o.description || 'Other Income',
        party: `Received from: ${o.receivedFrom}`,
      })),
      ...expenses.map((e): UnbalancedTransaction => ({
        date: e.date,
        description: e.description || e.category,
        amount: -e.amount,
        type: 'expense',
        label: e.category,
        party: e.payee ? `Payee: ${e.payee}` : e.description || undefined,
        reference: e.reference || undefined,
      })),
      ...creditNotes.map((c): UnbalancedTransaction => {
        const customer = customerName(c.customer as unknown as CustomerNameFields | null);
        return {
          date: c.date,
          description: `Credit note ${c.creditNoteNumber} — ${c.reason}`,
          amount: -c.amount,
          type: 'credit_note',
          label: 'Credit Note Refund',
          party: customer ? `Customer: ${customer}` : undefined,
          reference: c.creditNoteNumber,
        };
      }),
      ...transfers.map((t): UnbalancedTransaction => {
        const from = t.fromAccount as unknown as { _id: Types.ObjectId; name?: string };
        const to = t.toAccount as unknown as { _id: Types.ObjectId; name?: string };
        const isSource = from._id.toString() === accountId;
        const reference = t.reference ? ` — ${t.reference}` : '';
        const shared = { date: t.date, type: 'bank_transfer' as const, reference: t.reference || undefined };
        return isSource
          ? {
              ...shared,
              description: `Transfer to ${to.name ?? 'another account'}${reference}`,
              amount: -t.amount,
              label: 'Transfer Out',
              party: `To: ${to.name ?? 'another account'}`,
            }
          : {
              ...shared,
              description: `Transfer from ${from.name ?? 'another account'}${reference}`,
              amount: t.amount,
              label: 'Transfer In',
              party: `From: ${from.name ?? 'another account'}`,
            };
      }),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let running = openingBalance;
    const transactions: BankTransaction[] = unbalanced.map((t) => {
      running += t.amount;
      return { ...t, balance: running };
    });

    return { openingBalance, closingBalance: running, transactions };
  }
}

type CustomerNameFields = { name?: string; firstName?: string; surname?: string };

function customerName(customer: CustomerNameFields | null | undefined): string | undefined {
  if (!customer) return undefined;
  return customer.name || [customer.firstName, customer.surname].filter(Boolean).join(' ') || undefined;
}
