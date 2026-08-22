import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreditNote } from '../credit-notes/schemas/credit-note.schema';
import { Expense } from '../expenses/schemas/expense.schema';
import { Payment } from '../payments/schemas/payment.schema';

export interface IncomeExpenseMonth {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(CreditNote.name) private readonly creditNoteModel: Model<CreditNote>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
  ) {}

  // Business-wide equivalent of AuditLogService.incomeByMonth() (same
  // since/sparse-fill approach), except: (a) grouped by the transaction's own
  // `date` field rather than `createdAt`, since these all carry a real
  // transaction date; (b) three separate aggregations merged per month
  // instead of one, since payments/credit notes/expenses are separate
  // collections, not rows of one shared audit log.
  async incomeVsExpenses(months: number): Promise<IncomeExpenseMonth[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const groupByMonth = (dateField = '$date') => ({
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: dateField } },
        total: { $sum: '$amount' },
      },
    });

    const [paymentRows, creditNoteRows, expenseRows] = await Promise.all([
      // Gross amount -- any processing charge is now its own real Expense
      // (category "Payment Charges", see PaymentsService.create()), already
      // counted in the expense aggregation below, so summing net here would
      // double-count it.
      this.paymentModel.aggregate<{ _id: string; total: number }>([
        { $match: { date: { $gte: since } } },
        groupByMonth(),
      ]),
      this.creditNoteModel.aggregate<{ _id: string; total: number }>([
        { $match: { date: { $gte: since } } },
        groupByMonth(),
      ]),
      this.expenseModel.aggregate<{ _id: string; total: number }>([
        { $match: { date: { $gte: since } } },
        groupByMonth(),
      ]),
    ]);

    const paymentsByMonth = new Map(paymentRows.map((r) => [r._id, r.total]));
    const creditNotesByMonth = new Map(creditNoteRows.map((r) => [r._id, r.total]));
    const expensesByMonth = new Map(expenseRows.map((r) => [r._id, r.total]));

    const result: IncomeExpenseMonth[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const income = (paymentsByMonth.get(key) ?? 0) - (creditNotesByMonth.get(key) ?? 0);
      const expenses = expensesByMonth.get(key) ?? 0;
      result.push({ month: key, income, expenses, net: income - expenses });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }
}
