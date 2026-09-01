import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Appointment } from './schemas/appointment.schema';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

// A 'YYYY-MM-DD' string is parsed by its own Y/M/D components rather than via
// `new Date(str)` (which treats a bare date string as UTC midnight) -- same
// timezone-safety convention as DayBookingsService.toDayStart.
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
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<Appointment>,
  ) {}

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    const created = await new this.appointmentModel({
      customer: dto.customer,
      reason: dto.reason,
      date: toDayStart(dto.date),
      time: dto.time,
    }).save();
    return created.populate('customer', 'name');
  }

  // Inclusive of `from`, exclusive of `to`, same convention as
  // DayBookingsService.findForRange.
  findForRange(from: string, to: string): Promise<Appointment[]> {
    return this.appointmentModel
      .find({ date: { $gte: toDayStart(from), $lt: toDayStart(to) } })
      .populate('customer', 'name')
      .sort({ date: 1, time: 1 })
      .exec();
  }

  async update(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.date) update.date = toDayStart(dto.date);
    const appointment = await this.appointmentModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name')
      .exec();
    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }
    return appointment;
  }

  async remove(id: string): Promise<void> {
    const result = await this.appointmentModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }
  }
}
