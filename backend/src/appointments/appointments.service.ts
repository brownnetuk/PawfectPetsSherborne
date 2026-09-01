import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { PushService } from '../push/push.service';
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
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<Appointment>,
    private readonly pushService: PushService,
  ) {}

  // The appointment's actual start moment: its calendar day (stored at local
  // midnight) plus its 'HH:mm' time, in the server's local timezone.
  private startAt(appointment: Appointment): Date {
    const [hh, mm] = (appointment.time || '00:00').split(':').map(Number);
    const start = new Date(appointment.date);
    start.setHours(hh || 0, mm || 0, 0, 0);
    return start;
  }

  // Every 5 minutes, push a reminder for any appointment starting within the
  // next hour that hasn't been reminded yet. `reminderSentAt` guards against
  // repeat sends. No-op when APNs isn't configured.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDueReminders(): Promise<void> {
    if (!this.pushService.configured) return;
    const now = new Date();
    const horizon = new Date(now.getTime() + 60 * 60 * 1000);
    // Candidates: not yet reminded, on today's date (cheap pre-filter); the
    // exact start-time window is checked in JS since `time` is a string.
    const candidates = await this.appointmentModel
      .find({ reminderSentAt: { $exists: false } })
      .populate('customer', 'name')
      .exec();
    for (const appt of candidates) {
      const start = this.startAt(appt);
      if (start > now && start <= horizon) {
        const who = (appt.customer as unknown as { name?: string })?.name ?? 'a customer';
        const timeLabel = appt.time;
        try {
          await this.pushService.sendToAll(
            'Appointment in 1 hour',
            `${who} at ${timeLabel}${appt.reason ? ' — ' + appt.reason : ''}`,
            { type: 'appointment', appointmentId: appt._id?.toString() },
          );
          appt.reminderSentAt = new Date();
          await appt.save();
        } catch (err) {
          this.logger.warn(`Failed to send appointment reminder: ${(err as Error).message}`);
        }
      }
    }
  }

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
