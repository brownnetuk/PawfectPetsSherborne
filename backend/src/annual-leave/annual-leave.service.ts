import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateAnnualLeaveDto } from './dto/create-annual-leave.dto';
import { AnnualLeave } from './schemas/annual-leave.schema';

// A 'YYYY-MM-DD' string is parsed by its own Y/M/D components rather than via
// `new Date(str)` (which treats a bare date string as UTC midnight) -- same
// timezone-safety convention as BankHolidaysService.toDateOnly.
function toDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Injectable()
export class AnnualLeaveService {
  constructor(
    @InjectModel(AnnualLeave.name) private readonly annualLeaveModel: Model<AnnualLeave>,
  ) {}

  create(dto: CreateAnnualLeaveDto): Promise<AnnualLeave> {
    return new this.annualLeaveModel({
      name: dto.name,
      startDate: toDateOnly(dto.startDate),
      endDate: toDateOnly(dto.endDate),
    }).save();
  }

  findAll(): Promise<AnnualLeave[]> {
    return this.annualLeaveModel.find().sort({ startDate: 1 }).exec();
  }

  async update(id: string, dto: CreateAnnualLeaveDto): Promise<AnnualLeave> {
    const annualLeave = await this.annualLeaveModel
      .findByIdAndUpdate(
        id,
        { name: dto.name, startDate: toDateOnly(dto.startDate), endDate: toDateOnly(dto.endDate) },
        { new: true },
      )
      .exec();
    if (!annualLeave) {
      throw new NotFoundException(`Annual leave ${id} not found`);
    }
    return annualLeave;
  }

  async remove(id: string): Promise<void> {
    const result = await this.annualLeaveModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Annual leave ${id} not found`);
    }
  }
}
