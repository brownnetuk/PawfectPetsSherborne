import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { CreateOtherIncomeDto } from './dto/create-other-income.dto';
import { UpdateOtherIncomeDto } from './dto/update-other-income.dto';
import { OtherIncome } from './schemas/other-income.schema';

// The mirror image of ExpensesService: credits the account on create and
// reverses that credit on update/remove.
@Injectable()
export class OtherIncomeService {
  constructor(
    @InjectModel(OtherIncome.name)
    private readonly otherIncomeModel: Model<OtherIncome>,
    private readonly bankAccountsService: BankAccountsService,
  ) {}

  async create(dto: CreateOtherIncomeDto): Promise<OtherIncome> {
    const created = await new this.otherIncomeModel(dto).save();
    await this.bankAccountsService.adjustBalance(created.account, created.amount);
    return created.populate('account', 'name type');
  }

  findAll(): Promise<OtherIncome[]> {
    return this.otherIncomeModel
      .find()
      .sort({ date: -1, createdAt: -1 })
      .populate('account', 'name type')
      .exec();
  }

  // Same reverse-the-old/apply-the-new approach as ExpensesService.update(),
  // so a changed amount and/or account both net out correctly.
  async update(id: string, dto: UpdateOtherIncomeDto): Promise<OtherIncome> {
    const before = await this.otherIncomeModel.findById(id).exec();
    if (!before) {
      throw new NotFoundException(`Other income ${id} not found`);
    }
    const updated = await this.otherIncomeModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`Other income ${id} not found`);
    }
    await this.bankAccountsService.adjustBalance(before.account, -before.amount);
    await this.bankAccountsService.adjustBalance(updated.account, updated.amount);
    return updated.populate('account', 'name type');
  }

  async remove(id: string): Promise<void> {
    const result = await this.otherIncomeModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Other income ${id} not found`);
    }
    await this.bankAccountsService.adjustBalance(result.account, -result.amount);
  }
}
