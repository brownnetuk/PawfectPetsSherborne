import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { Animal } from '../animals/schemas/animal.schema';
import { ChecklistsService } from '../checklists/checklists.service';
import { VisitMapping } from '../settings/schemas/visit-mapping.schema';
import { CreateDayBookingDto } from './dto/create-day-booking.dto';
import { UpdateDayBookingDto } from './dto/update-day-booking.dto';
import { DayBooking } from './schemas/day-booking.schema';

export interface DayCareStayPlan {
  animals: string[];
  date: string;
  dropOffPeriod: 'AM' | 'PM';
  dropOffTime?: string;
  collectionPeriod: 'AM' | 'PM';
  collectionTime?: string;
}

export interface BoardingStayPlan {
  animals: string[];
  startDate: string;
  dropOffTime: string;
  endDate: string;
  pickUpTime: string;
}

export type BoardingLineKind = 'boarding' | 'halfDay';

export interface BoardingPlanLine {
  dogIndex: number; // 0-based position in the animals list
  dayOffset: number; // 0 = start date
  kind: BoardingLineKind;
  secondDog: boolean; // uses the 2nd-dog product rate
  productId: string | null; // resolved from the VisitMapping, null if unmapped
  // Presence-only row (pick-up day of an exact-24h/exact-12h-rounded stay)
  // -- shown but not billed.
  placeholder?: boolean;
}

export interface BoardingPlan {
  boardingDays: number;
  partial: 'none' | 'half';
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
    private readonly checklists: ChecklistsService,
  ) {}

  // Boarding vs Day Care, purely from which VisitMapping product slot a
  // booking's product fills -- there's no stored category on Product itself,
  // same lookup computeBoardingPlan() above does in reverse (category ->
  // product). Returns null for Visits or an unmapped product, neither of
  // which any checklist auto-assigns against.
  private async classifyBooking(productId: string): Promise<'boarding' | 'dayCare' | null> {
    const mapping = await this.visitMappingModel.findOne().exec();
    if (!mapping) return null;
    const boarding = [
      mapping.boardingPerDayProduct,
      mapping.boardingSecondDogPerDayProduct,
      mapping.boardingHalfDayProduct,
      mapping.boardingSecondDogHalfDayProduct,
    ];
    const dayCare = [
      mapping.dayCareHalfDayProduct,
      mapping.dayCareFullDayProduct,
      mapping.dayCareSecondDogHalfDayProduct,
      mapping.dayCareSecondDogFullDayProduct,
    ];
    if (boarding.some((p) => p && String(p) === productId)) return 'boarding';
    if (dayCare.some((p) => p && String(p) === productId)) return 'dayCare';
    return null;
  }

  // Turns a boarding stay's start/end datetimes + dog count into the exact set
  // of product lines to book, resolving each to the catalogue product
  // configured in Settings > Bookings > Boarding. Rules (confirmed with the
  // business): the first day and every 24h after it is a full Boarding day;
  // whatever's left over rounds up to the nearest charge -- a Half Day (12h)
  // if it's 12h or less, otherwise it rounds up to another full Boarding day
  // (never a Day Care product; boarding leftover is always billed as
  // boarding). Only the *2nd* dog uses the 2nd-dog product rates; the 1st and
  // any 3rd+ dogs use the normal ones. The Half Day (or the pick-up-day
  // placeholder, when there's no leftover at all) lands on the pickup day
  // (the day after the last full boarding day). Single source of truth -- the
  // admin calls this, then creates the day bookings it returns.
  async computeBoardingPlan(startIso: string, endIso: string, dogCount: number): Promise<BoardingPlan> {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    const wholeDays = hours > 0 ? Math.floor(hours / 24) : 0;
    const remainder = hours - wholeDays * 24;
    // > 12h rounds up to a whole extra Boarding day instead of a Half Day.
    const boardingDays = remainder > 12 ? wholeDays + 1 : wholeDays;
    const partial: 'none' | 'half' = remainder > 0 && remainder <= 12 ? 'half' : 'none';

    const mapping = await this.visitMappingModel.findOne().exec();
    const id = (v?: unknown): string | null => (v ? String(v) : null);
    const products = {
      boarding: id(mapping?.boardingPerDayProduct),
      boardingSecond: id(mapping?.boardingSecondDogPerDayProduct),
      half: id(mapping?.boardingHalfDayProduct),
      halfSecond: id(mapping?.boardingSecondDogHalfDayProduct),
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
      if (partial === 'half') {
        const productId = secondDog ? products.halfSecond : products.half;
        if (!productId) missing.add(secondDog ? '2nd Dog Half Day (Boarding)' : 'Half Day (Boarding)');
        lines.push({ dogIndex, dayOffset: boardingDays, kind: 'halfDay', secondDog, productId });
      } else if (boardingDays > 0) {
        // Nothing billed on the pick-up day, so add a presence-only
        // placeholder there (carries the boarding product so it still
        // renders as boarding on the calendar) that's never invoiced.
        const productId = secondDog ? products.boardingSecond : products.boarding;
        lines.push({ dogIndex, dayOffset: boardingDays, kind: 'boarding', secondDog, productId, placeholder: true });
      }
    }

    return { boardingDays, partial, lines, missing: [...missing] };
  }

  // Same lookup admin/src/utils/visitMapping.ts's dayCareProductFor() does --
  // moved here (from being duplicated in QuotesService) so both quote
  // acceptance and direct boarding-booking creation resolve day-care pricing
  // one way.
  private dayCareProductFor(
    mapping: VisitMapping,
    dropOffPeriod: string,
    collectionPeriod: string,
  ) {
    const isFullDay = dropOffPeriod === 'AM' && collectionPeriod === 'PM';
    return isFullDay ? mapping.dayCareFullDayProduct : mapping.dayCareHalfDayProduct;
  }

  // Creates one day-care stay's DayBooking rows (one per animal, sharing a
  // fresh stayId) and returns how many were created -- the single place both
  // QuotesService (accepting a quote's dayCarePlan) and BoardingBookingsService
  // (confirming a direct day-care booking) go through, so there's exactly one
  // copy of this pricing lookup rather than a hand-kept-in-sync duplicate.
  async createDayCareStay(
    plan: DayCareStayPlan,
    invoiceId?: string,
  ): Promise<{ stayId: string; bookings: DayBooking[] }> {
    const mapping = await this.visitMappingModel.findOne().exec();
    const productId = mapping && this.dayCareProductFor(mapping, plan.dropOffPeriod, plan.collectionPeriod);
    if (!productId) {
      throw new BadRequestException(
        'No Day Care product is configured yet -- set one in Settings > Bookings > Day Care first.',
      );
    }
    const animals = await this.animalModel.find({ _id: { $in: plan.animals } }).exec();
    const date = toDayStart(plan.date);
    const stayId = randomUUID();
    const bookings: DayBooking[] = [];
    for (const animal of animals) {
      const created = await new this.dayBookingModel({
        animal: animal._id,
        customer: animal.customer,
        date,
        product: productId,
        quantity: 1,
        dropOffPeriod: plan.dropOffPeriod,
        dropOffTime: plan.dropOffTime,
        collectionPeriod: plan.collectionPeriod,
        collectionTime: plan.collectionTime,
        stayId,
        invoice: invoiceId,
      }).save();
      bookings.push(await created.populate('product', 'name price'));
    }
    return { stayId, bookings };
  }

  // Same as createDayCareStay above, for a boarding stay -- resolves the plan
  // via computeBoardingPlan() (the single source of truth for the day/product
  // breakdown) and books one row per resulting line, stamping dropOffTime on
  // each dog's earliest row and pickUpTime on its latest one.
  async createBoardingStay(
    plan: BoardingStayPlan,
    invoiceId?: string,
  ): Promise<{ stayId: string; bookings: DayBooking[] }> {
    const startIso = `${plan.startDate}T${plan.dropOffTime}:00`;
    const endIso = `${plan.endDate}T${plan.pickUpTime}:00`;
    const boardingPlan = await this.computeBoardingPlan(startIso, endIso, plan.animals.length);
    if (boardingPlan.lines.length === 0) {
      throw new BadRequestException('This boarding stay is too short to book anything.');
    }
    if (boardingPlan.missing.length > 0) {
      throw new BadRequestException(
        `Missing product mapping for: ${boardingPlan.missing.join(', ')} -- configure these in Settings > Bookings > Boarding first.`,
      );
    }
    const animals = await this.animalModel.find({ _id: { $in: plan.animals } }).exec();
    const byId = new Map(animals.map((a) => [String(a._id), a]));
    const startDate = toDayStart(plan.startDate);
    const addDays = (d: Date, n: number) => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r;
    };
    const byDog = new Map<number, BoardingPlanLine[]>();
    for (const line of boardingPlan.lines) {
      const arr = byDog.get(line.dogIndex) ?? [];
      arr.push(line);
      byDog.set(line.dogIndex, arr);
    }
    const stayId = randomUUID();
    const bookings: DayBooking[] = [];
    for (const [dogIndex, lines] of byDog) {
      const animal = byId.get(plan.animals[dogIndex]);
      if (!animal) continue;
      lines.sort((a, b) => a.dayOffset - b.dayOffset);
      const first = lines[0];
      const last = lines[lines.length - 1];
      for (const line of lines) {
        const created = await new this.dayBookingModel({
          animal: animal._id,
          customer: animal.customer,
          date: addDays(startDate, line.dayOffset),
          product: line.productId ?? undefined,
          quantity: 1,
          dropOffTime: line === first ? plan.dropOffTime : undefined,
          pickUpTime: line === last ? plan.pickUpTime : undefined,
          boardingStay: true,
          placeholder: line.placeholder ?? false,
          stayId,
          invoice: line.placeholder ? undefined : invoiceId,
        }).save();
        bookings.push(await created.populate('product', 'name price'));
      }
    }
    return { stayId, bookings };
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
      boardingStay: dto.boardingStay ?? false,
      stayId: dto.stayId ?? undefined,
    }).save();

    // Best-effort -- a checklist auto-assign hiccup should never block the
    // booking itself from being created.
    try {
      const category = await this.classifyBooking(String(created.product));
      if (category) await this.checklists.autoAssignForDate(created.date, category);
    } catch (err) {
      console.error('Checklist auto-assign failed for new day booking (will just be missing, not retried):', err);
    }

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

  // Every row of one boarding stay (see stayId), so the admin can load a stay
  // to edit it as a unit.
  findStay(stayId: string): Promise<DayBooking[]> {
    return this.dayBookingModel
      .find({ stayId })
      .populate('animal', 'name species')
      .populate('customer', 'name')
      .populate('product', 'name price')
      .populate('invoice', 'invoiceNumber')
      .sort({ date: 1 })
      .exec();
  }

  // Patches `invoice` onto every non-placeholder row of a stay -- used by
  // BoardingBookingsService.createDirect(), which has to create the stay's
  // rows first (to know what to bill) before the invoice built from them
  // exists.
  async attachInvoiceToStay(stayId: string, invoiceId: string): Promise<void> {
    await this.dayBookingModel.updateMany({ stayId, placeholder: { $ne: true } }, { invoice: invoiceId }).exec();
  }

  // Deletes a whole boarding stay in one go -- used when editing a stay
  // (delete then recreate) and to remove it cleanly rather than row by row.
  async removeStay(stayId: string): Promise<{ deleted: number }> {
    const result = await this.dayBookingModel.deleteMany({ stayId }).exec();
    return { deleted: result.deletedCount ?? 0 };
  }
}
