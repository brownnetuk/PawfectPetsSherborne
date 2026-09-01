import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Animal } from '../animals/schemas/animal.schema';
import { CreateDayBookingDto } from './dto/create-day-booking.dto';
import { UpdateDayBookingDto } from './dto/update-day-booking.dto';
import { DayBooking } from './schemas/day-booking.schema';

// Truncates to local midnight so every entry on the same calendar day shares
// one exact Date value, regardless of what time the request came in at. A
// 'YYYY-MM-DD' string is parsed by its own Y/M/D components rather than via
// `new Date(str)` (which treats a bare date string as UTC midnight) --
// otherwise a non-UTC server timezone could shift the calendar day by one.
function toDayStart(date: string | Date): Date {
  if (typeof date === 'string') {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class DayBookingsService {
  constructor(
    @InjectModel(DayBooking.name) private readonly dayBookingModel: Model<DayBooking>,
    @InjectModel(Animal.name) private readonly animalModel: Model<Animal>,
  ) {}

  async create(dto: CreateDayBookingDto): Promise<DayBooking> {
    const animal = await this.animalModel.findById(dto.animal).exec();
    if (!animal) {
      throw new NotFoundException(`Animal ${dto.animal} not found`);
    }
    const created = await new this.dayBookingModel({
      animal: dto.animal,
      customer: animal.customer,
      date: toDayStart(dto.date),
      product: dto.product,
      quantity: dto.quantity ?? 1,
      visitTime: dto.visitTime ?? undefined,
    }).save();
    return created.populate([
      { path: 'animal', select: 'name species' },
      { path: 'customer', select: 'name' },
      { path: 'product', select: 'name price' },
      { path: 'invoice', select: 'invoiceNumber' },
    ]);
  }

  // Inclusive of `from`, exclusive of `to` -- callers pass the day after the
  // last visible calendar day as `to`, same $gte/$lt convention used
  // elsewhere in this codebase (e.g. BankAccountsService.getTransactions).
  findForRange(from: string, to: string): Promise<DayBooking[]> {
    return this.dayBookingModel
      .find({ date: { $gte: toDayStart(from), $lt: toDayStart(to) } })
      .populate('animal', 'name species')
      .populate('customer', 'name')
      .populate('product', 'name price')
      .populate('invoice', 'invoiceNumber')
      .sort({ date: 1 })
      .exec();
  }

  // All of one customer's day bookings, past and future -- used by the
  // Customer Detail page's Bookings tab, which has no date-range picker of
  // its own (unlike the Bookings calendar, which always passes from/to).
  findForCustomer(customerId: string): Promise<DayBooking[]> {
    return this.dayBookingModel
      .find({ customer: customerId })
      .populate('animal', 'name species')
      .populate('customer', 'name')
      .populate('product', 'name price')
      .populate('invoice', 'invoiceNumber')
      .sort({ date: 1 })
      .exec();
  }

  async update(id: string, dto: UpdateDayBookingDto): Promise<DayBooking> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.date) update.date = toDayStart(dto.date);
    const dayBooking = await this.dayBookingModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('animal', 'name species')
      .populate('customer', 'name')
      .populate('product', 'name price')
      .populate('invoice', 'invoiceNumber')
      .exec();
    if (!dayBooking) {
      throw new NotFoundException(`Day booking ${id} not found`);
    }
    return dayBooking;
  }

  async remove(id: string): Promise<void> {
    const result = await this.dayBookingModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Day booking ${id} not found`);
    }
  }
}
