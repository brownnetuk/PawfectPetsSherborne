import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { BankAccount } from './schemas/bank-account.schema';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectModel(BankAccount.name) private readonly bankAccountModel: Model<BankAccount>,
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
}
