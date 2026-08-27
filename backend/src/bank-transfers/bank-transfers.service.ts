import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { CreateBankTransferDto } from './dto/create-bank-transfer.dto';
import { BankTransfer } from './schemas/bank-transfer.schema';

@Injectable()
export class BankTransfersService {
  constructor(
    @InjectModel(BankTransfer.name) private readonly bankTransferModel: Model<BankTransfer>,
    private readonly bankAccountsService: BankAccountsService,
  ) {}

  async create(dto: CreateBankTransferDto): Promise<BankTransfer> {
    if (dto.fromAccount === dto.toAccount) {
      throw new BadRequestException('Source and destination accounts must be different.');
    }
    const created = await new this.bankTransferModel(dto).save();
    await this.bankAccountsService.adjustBalance(created.fromAccount, -created.amount);
    await this.bankAccountsService.adjustBalance(created.toAccount, created.amount);
    return created;
  }

  findAll(): Promise<BankTransfer[]> {
    return this.bankTransferModel
      .find()
      .sort({ date: -1 })
      .populate('fromAccount', 'name type')
      .populate('toAccount', 'name type')
      .exec();
  }

  // Reverses the original adjustment -- adds back what left `fromAccount`,
  // removes what arrived in `toAccount` -- same undo-the-adjustment approach
  // ExpensesService.remove() uses.
  async remove(id: string): Promise<void> {
    const result = await this.bankTransferModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Bank transfer ${id} not found`);
    }
    await this.bankAccountsService.adjustBalance(result.fromAccount, result.amount);
    await this.bankAccountsService.adjustBalance(result.toAccount, -result.amount);
  }
}
