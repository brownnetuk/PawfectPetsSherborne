import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Animal } from '../animals/schemas/animal.schema';
import { VisitMapping } from '../settings/schemas/visit-mapping.schema';
import { CreateDayBookingDto } from './dto/create-day-booking.dto';
import { UpdateDayBookingDto } from './dto/update-day-booking.dto';
import { DayBooking } from './schemas/day-booking.schema';

export type BoardingLineKind = 'boarding' | 'halfDay' | 'fullDay';

export interface BoardingPlanLine {
  dogIndex: number; // 0-based position in the animals list
  dayOffset: number; // 0 = start date
  kind: BoardingLineKind;
  secondDog: boolean; // uses the 2nd-dog product rate
  productId: string | null; // resolved from the VisitMapping, null if unmapped
  // Presence-only row (pick-up day of an exact-24h stay) -- shown but not billed.
  placeholder?: boolean;
}

export interface BoardingPlan {
  boardingDays: number;
  partial: 'none' | 'half' | 'full';
  lines: BoardingPlanLine[];
  // Human labels of the product slots the plan needs but that aren't set in
  // Settings > Bookings -- the admin blocks the booking and names these.
  missing: string[];
}

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
    @InjectModel(VisitMapping.name) private readonly visitMappingModel: Model<VisitMapping>,
  ) {}

  // Turns a boarding stay's start/end datetimes + dog count into the exact set
  // of product lines to book, resolving each to the catalogue product configured
  // in Settings > Bookings (Day Care / Boarding). Rules (confirmed with the
  // business): whole 24h blocks = Boarding days; the leftover remainder is one
  // Day Care day -- Half if <= 6h, Full if > 6h. Only the *2nd* dog uses the
  // 2nd-dog product rates; the 1st and any 3rd+ dogs use the normal ones. The
  // Half/Full Day Care lands on the pickup day (the day after the last full
  // boarding day). Single source of truth -- the admin calls this, then creates
  // the day bookings it returns.
  async computeBoardingPlan(startIso: string, endIso: string, dogCount: number): Promise<BoardingPlan> {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    const boardingDays = hours > 0 ? Math.floor(hours / 24) : 0;
    const remainder = hours - boardingDays * 24;
    const partial: 'none' | 'half' | 'full' = remainder <= 0 ? 'none' : remainder <= 6 ? 'half' : 'full';

    const mapping = await this.visitMappingModel.findOne().exec();
    const id = (v?: unknown): string | null => (v ? String(v) : null);
    const products = {
      boarding: id(mapping?.boardingPerDayProduct),
      boardingSecond: id(mapping?.boardingSecondDogPerDayProduct),
      half: id(mapping?.dayCareHalfDayProduct),
      halfSecond: id(mapping?.dayCareSecondDogHalfDayProduct),
      full: id(mapping?.dayCareFullDayProduct),
      fullSecond: id(mapping?.dayCareSecondDogFullDayProduct),
    };

    const dogs = Math.max(1, Math.floor(dogCount) || 1);
    const lines: BoardingPlanLine[] = [];
    const missing = new Set<string>();

    for (let dogIndex = 0; dogIndex < dogs; dogIndex++) {
      const secondDog = dogIndex === 1; // only the 2nd dog gets 2nd-dog rates
      for (let day = 0; day < boardingDays; day++) {
        const productId = secondDog ? products.boardingSecond : products.boarding;
        if (!productId) missing.add(secondDog ? '2nd Dog Per Day (Boarding)' : 'Per Day (Boarding)');
        lines.push({ dogIndex, dayOffset: day, kind: 'boarding', secondDog, productId });
      }
      if (partial !== 'none') {
        const kind: BoardingLineKind = partial === 'half' ? 'halfDay' : 'fullDay';
        const productId =
          partial === 'half'
            ? secondDog
              ? products.halfSecond
              : products.half
            : secondDog
              ? products.fullSecond
              : products.full;
        if (!productId) {
          if (partial === 'half') missing.add(secondDog ? '2nd Dog Half Day' : 'Half Day');
          else missing.add(secondDog ? '2nd Dog Full Day' : 'Full Day');
        }
        lines.push({ dogIndex, dayOffset: boardingDays, kind, secondDog, productId });
      } else if (boardingDays > 0) {
        // Exact 24h multiple -- nothing billed on the pick-up day, so add a
        // presence-only placeholder there (carries the boarding product so it
        // still renders as boarding on the calendar) that's never invoiced.
        const productId = secondDog ? products.boardingSecond : products.boarding;
        lines.push({ dogIndex, dayOffset: boardingDays, kind: 'boarding', secondDog, productId, placeholder: true });
      }
    }

    return { boardingDays, partial, lines, missing: [...missing] };
  }

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
      dropOffPeriod: dto.dropOffPeriod ?? undefined,
      dropOffTime: dto.dropOffTime ?? undefined,
      collectionPeriod: dto.collectionPeriod ?? undefined,
      collectionTime: dto.collectionTime ?? undefined,
      pickUpTime: dto.pickUpTime ?? undefined,
      placeholder: dto.placeholder ?? false,
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
