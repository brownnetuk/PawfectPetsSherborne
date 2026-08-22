import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { describeBlockers } from '../common/delete-guard.util';
import { formatUkDate } from '../common/invoice-email.util';
import { Invoice } from '../invoices/schemas/invoice.schema';
import { Quote } from '../quotes/schemas/quote.schema';
import { Booking } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
    @InjectModel(Quote.name) private readonly quoteModel: Model<Quote>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateBookingDto, actor = 'Staff'): Promise<Booking> {
    const created = await new this.bookingModel(dto).save();
    await this.auditLogService.record(
      created.customer,
      AuditEventType.BOOKING_CREATED,
      'Booking created',
      `${created.serviceType} — ${formatUkDate(created.startDate)} to ${formatUkDate(created.endDate)}`,
      undefined,
      actor,
    );
    return created;
  }

  findAll(customerId?: string): Promise<Booking[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.bookingModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('animals')
      .populate('customer', 'name email')
      .exec();
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingModel
      .findById(id)
      .populate('animals')
      .populate('customer', 'name email')
      .exec();
    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }

  async update(id: string, dto: UpdateBookingDto, actor = 'Staff'): Promise<Booking> {
    const booking = await this.bookingModel
      .findByIdAndUpdate(id, dto, { new: true })
      .populate('animals')
      .populate('customer', 'name email')
      .exec();
    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    const customerId = (booking.customer as unknown as { _id?: unknown })?._id ?? booking.customer;
    await this.auditLogService.record(
      customerId as string,
      AuditEventType.BOOKING_UPDATED,
      'Booking updated',
      `${booking.serviceType} — ${formatUkDate(booking.startDate)} to ${formatUkDate(booking.endDate)}`,
      undefined,
      actor,
    );
    return booking;
  }

  async remove(id: string, actor = 'Staff'): Promise<void> {
    const [invoiceCount, quoteCount] = await Promise.all([
      this.invoiceModel.countDocuments({ booking: id }).exec(),
      this.quoteModel.countDocuments({ booking: id }).exec(),
    ]);
    const blockers = describeBlockers({ invoice: invoiceCount, quote: quoteCount });
    if (blockers) {
      throw new ConflictException(`Can't delete this booking: it's linked to ${blockers}. Remove those first.`);
    }
    const result = await this.bookingModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    await this.auditLogService.record(
      result.customer,
      AuditEventType.BOOKING_REMOVED,
      'Booking removed',
      `${result.serviceType} — ${formatUkDate(result.startDate)} to ${formatUkDate(result.endDate)}`,
      undefined,
      actor,
    );
  }
}
