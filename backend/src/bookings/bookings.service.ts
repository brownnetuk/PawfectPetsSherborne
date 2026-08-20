import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Booking } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Injectable()
export class BookingsService {
  constructor(@InjectModel(Booking.name) private readonly bookingModel: Model<Booking>) {}

  create(dto: CreateBookingDto): Promise<Booking> {
    return new this.bookingModel(dto).save();
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

  async update(id: string, dto: UpdateBookingDto): Promise<Booking> {
    const booking = await this.bookingModel
      .findByIdAndUpdate(id, dto, { new: true })
      .populate('animals')
      .populate('customer', 'name email')
      .exec();
    if (!booking) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }

  async remove(id: string): Promise<void> {
    const result = await this.bookingModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Booking ${id} not found`);
    }
  }
}
