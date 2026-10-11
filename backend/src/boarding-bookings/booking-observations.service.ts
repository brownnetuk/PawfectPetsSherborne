import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BookingObservationDto } from './dto/booking-observation.dto';
import { BoardingBooking } from './schemas/boarding-booking.schema';
import { BookingObservation } from './schemas/booking-observation.schema';

@Injectable()
export class BookingObservationsService {
  constructor(
    @InjectModel(BookingObservation.name)
    private readonly observationModel: Model<BookingObservation>,
    @InjectModel(BoardingBooking.name)
    private readonly boardingBookingModel: Model<BoardingBooking>,
  ) {}

  // Newest first, so the latest note is at the top of the booking's list.
  findForBooking(bookingId: string): Promise<BookingObservation[]> {
    return this.observationModel
      .find({ booking: new Types.ObjectId(bookingId) })
      .sort({ observedAt: -1, createdAt: -1 })
      .exec();
  }

  async create(
    bookingId: string,
    dto: BookingObservationDto,
    staffName: string,
  ): Promise<BookingObservation> {
    const exists = await this.boardingBookingModel.exists({ _id: bookingId });
    if (!exists) throw new NotFoundException(`Booking ${bookingId} not found`);
    return new this.observationModel({
      booking: bookingId,
      observedAt: new Date(dto.observedAt),
      category: dto.category,
      description: dto.description?.trim() || undefined,
      photos: dto.photos ?? [],
      observedBy: staffName,
    }).save();
  }

  // observedBy is deliberately left alone -- it stays whoever logged it.
  async update(
    bookingId: string,
    id: string,
    dto: BookingObservationDto,
  ): Promise<BookingObservation> {
    const observation = await this.observationModel
      .findOneAndUpdate(
        { _id: id, booking: bookingId },
        {
          observedAt: new Date(dto.observedAt),
          category: dto.category,
          description: dto.description?.trim() || undefined,
          photos: dto.photos ?? [],
        },
        { new: true },
      )
      .exec();
    if (!observation)
      throw new NotFoundException(`Observation ${id} not found`);
    return observation;
  }

  async remove(bookingId: string, id: string): Promise<void> {
    const result = await this.observationModel
      .findOneAndDelete({ _id: id, booking: bookingId })
      .exec();
    if (!result) throw new NotFoundException(`Observation ${id} not found`);
  }

  // Called when the booking itself is deleted.
  async removeForBooking(bookingId: string): Promise<void> {
    await this.observationModel
      .deleteMany({ booking: new Types.ObjectId(bookingId) })
      .exec();
  }
}
