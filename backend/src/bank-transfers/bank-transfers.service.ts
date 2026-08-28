import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { CreateBankTransferDto } from './dto/create-bank-transfer.dto';
import { UpdateBankTransferDto } from './dto/update-bank-transfer.dto';
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

  // Editing reverses the original adjustment on both accounts, then applies the
  // new one -- so balances stay correct even if the accounts or amount changed.
  async update(id: string, dto: UpdateBankTransferDto): Promise<BankTransfer> {
    const transfer = await this.bankTransferModel.findById(id).exec();
    if (!transfer) {
      throw new NotFoundException(`Bank transfer ${id} not found`);
    }

    // 1. Reverse the existing transfer's effect.
    await this.bankAccountsService.adjustBalance(transfer.fromAccount, transfer.amount);
    await this.bankAccountsService.adjustBalance(transfer.toAccount, -transfer.amount);

    // 2. Resolve the new values, falling back to the current ones.
    const fromAccount = dto.fromAccount ?? transfer.fromAccount.toString();
    const toAccount = dto.toAccount ?? transfer.toAccount.toString();
    const amount = dto.amount ?? transfer.amount;
    if (fromAccount === toAccount) {
      throw new BadRequestException('Source and destination accounts must be different.');
    }

    // 3. Persist.
    if (dto.date) transfer.date = new Date(dto.date);
    if (dto.reference !== undefined) transfer.reference = dto.reference;
    transfer.fromAccount = new Types.ObjectId(fromAccount);
    transfer.toAccount = new Types.ObjectId(toAccount);
    transfer.amount = amount;
    const saved = await transfer.save();

    // 4. Apply the new effect.
    await this.bankAccountsService.adjustBalance(fromAccount, -amount);
    await this.bankAccountsService.adjustBalance(toAccount, amount);
    return saved;
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
