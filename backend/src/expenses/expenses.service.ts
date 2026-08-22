import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Expense } from './schemas/expense.schema';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
    private readonly bankAccountsService: BankAccountsService,
  ) {}

  async create(dto: CreateExpenseDto): Promise<Expense> {
    const created = await new this.expenseModel(dto).save();
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
    const expense = await this.expenseModel.findById(id).exec();
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
    return updated;
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
}
