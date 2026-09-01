import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBankHolidayDto } from './dto/create-bank-holiday.dto';
import { BankHoliday } from './schemas/bank-holiday.schema';

// A 'YYYY-MM-DD' string is parsed by its own Y/M/D components rather than via
// `new Date(str)` (which treats a bare date string as UTC midnight) -- same
// timezone-safety convention as DayBookingsService.toDayStart.
function toDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Injectable()
export class BankHolidaysService {
  constructor(
    @InjectModel(BankHoliday.name) private readonly bankHolidayModel: Model<BankHoliday>,
  ) {}

  create(dto: CreateBankHolidayDto): Promise<BankHoliday> {
    return new this.bankHolidayModel({ name: dto.name, date: toDateOnly(dto.date) }).save();
  }

  findAll(): Promise<BankHoliday[]> {
    return this.bankHolidayModel.find().sort({ date: 1 }).exec();
  }

  async update(id: string, dto: CreateBankHolidayDto): Promise<BankHoliday> {
    const bankHoliday = await this.bankHolidayModel
      .findByIdAndUpdate(id, { name: dto.name, date: toDateOnly(dto.date) }, { new: true })
      .exec();
    if (!bankHoliday) {
      throw new NotFoundException(`Bank holiday ${id} not found`);
    }
    return bankHoliday;
  }

  async remove(id: string): Promise<void> {
    const result = await this.bankHolidayModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Bank holiday ${id} not found`);
    }
  }
}
