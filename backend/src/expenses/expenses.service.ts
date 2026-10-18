import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { nextSequenceNumber } from '../common/document-number.util';
import { escapeHtml } from '../common/html.util';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { SendExpenseEmailDto } from './dto/send-expense-email.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense } from './schemas/expense.schema';

@Injectable()
export class ExpensesService implements OnModuleInit {
  constructor(
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly bankAccountsService: BankAccountsService,
    private readonly settingsService: SettingsService,
  ) {}

  onModuleInit() {
    // Fire-and-forget -- boot must never wait on it.
    void this.assignMissingExpenseIds();
  }

  private async nextExpenseId(): Promise<string> {
    const seq = await nextSequenceNumber(this.businessInfoModel, 'expenseNextNumber');
    return `EXP${String(seq).padStart(5, '0')}`;
  }

  /**
   * Numbers expenses recorded before expense IDs existed, oldest first, so
   * every expense (and its uploaded receipt) has one to search by and quote.
   * Idempotent: only expenses still without an ID are touched, so an
   * interrupted run just resumes on the next boot.
   */
  private async assignMissingExpenseIds(): Promise<void> {
    try {
      const missing = await this.expenseModel
        .find({ expenseId: { $exists: false } })
        .select('_id')
        .sort({ date: 1, createdAt: 1 })
        .exec();
      for (const doc of missing) {
        const expenseId = await this.nextExpenseId();
        await this.expenseModel.updateOne({ _id: doc._id, expenseId: { $exists: false } }, { $set: { expenseId } }).exec();
      }
      if (missing.length > 0) {
        console.log(`Expenses: assigned IDs to ${missing.length} existing expense(s).`);
      }
    } catch (err) {
      console.error('Assigning expense IDs failed (will retry next boot):', err);
    }
  }

  async create(dto: CreateExpenseDto): Promise<Expense> {
    const expenseId = await this.nextExpenseId();
    const created = await new this.expenseModel({ ...dto, expenseId }).save();
    if (created.account) {
      await this.bankAccountsService.adjustBalance(created.account, -created.amount);
    }
    return created;
  }

  findAll(from?: string, to?: string): Promise<Expense[]> {
    const filter: Record<string, unknown> = {};
    if (from || to) {
      filter.date = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to ? { $lte: new Date(to) } : {}),
      };
    }
    return this.expenseModel
      .find(filter)
      .sort({ date: -1 })
      .populate('account', 'name type')
      .exec();
  }

  async findOne(id: string): Promise<Expense> {
    // Populated like findAll() so the staff app's detail view can show the
    // "Paid from" account name, not just an id.
    const expense = await this.expenseModel.findById(id).populate('account', 'name type').exec();
    if (!expense) {
      throw new NotFoundException(`Expense ${id} not found`);
    }
    return expense;
  }

  // Reverts the old amount from whichever account it was debited against (if
  // any), then debits the new amount from the new account (if any) -- covers
  // an unchanged account (nets to the same balance, just a delta), a changed
  // account (moves the debit across), and adding/removing the account
  // entirely, all with the same two calls.
  async update(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const before = await this.expenseModel.findById(id).exec();
    if (!before) {
      throw new NotFoundException(`Expense ${id} not found`);
    }
    const updated = await this.expenseModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException(`Expense ${id} not found`);
    }
    if (before.account) {
      await this.bankAccountsService.adjustBalance(before.account, before.amount);
    }
    if (updated.account) {
      await this.bankAccountsService.adjustBalance(updated.account, -updated.amount);
    }
    // Populated only after the balance adjustments above, which need the raw
    // account id rather than a populated doc.
    return updated.populate('account', 'name type');
  }

  async remove(id: string): Promise<void> {
    const result = await this.expenseModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Expense ${id} not found`);
    }
    if (result.account) {
      await this.bankAccountsService.adjustBalance(result.account, result.amount);
    }
  }

  /**
   * Emails an expense's uploaded receipt (image or PDF) as an attachment to
   * an ad-hoc recipient, with the staff-written subject and message -- the
   * Financial > Uploads tab's "Email" action.
   */
  async sendReceiptEmail(id: string, dto: SendExpenseEmailDto): Promise<void> {
    const expense = await this.expenseModel.findById(id).exec();
    if (!expense) {
      throw new NotFoundException(`Expense ${id} not found`);
    }
    if (!expense.receipt) {
      throw new BadRequestException('This expense has no uploaded receipt to send.');
    }
    const html = (dto.message ?? '').split(/\r?\n/).map(escapeHtml).join('<br/>');
    const name = expense.receiptName || fallbackReceiptName(expense);
    await this.settingsService.sendDirectEmail(dto.to, dto.subject, `<p>${html}</p>`, { data: expense.receipt, name });
  }
}

// Receipts saved before renaming existed have no stored receiptName, so one
// is built the same Date-Payee-Amount.ext way the admin app does
// (admin/src/utils/receiptFile.ts), e.g. 2026-10-08-Amazon-9.99.jpg.
function fallbackReceiptName(expense: Expense): string {
  const safePart = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '');
  const mime = /^data:([^;,]+)/.exec(expense.receipt ?? '')?.[1]?.toLowerCase() ?? '';
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  const date = expense.date ? new Date(expense.date).toISOString().slice(0, 10) : 'undated';
  return `${date}-${safePart(expense.payee ?? '') || 'No-payee'}-${expense.amount.toFixed(2)}.${ext}`;
}
