import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Appointment } from '../appointments/schemas/appointment.schema';
import { DayBooking } from '../day-bookings/schemas/day-booking.schema';
import { PushService } from '../push/push.service';
import { NotificationSettingsService } from './notification-settings.service';

// Turns app events into push notifications, gated by NotificationSettings.
// Other modules call the notify* helpers; the daily digest runs on a cron.
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly push: PushService,
    private readonly settings: NotificationSettingsService,
    @InjectModel(DayBooking.name) private readonly dayBookingModel: Model<DayBooking>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<Appointment>,
  ) {}

  async notifyCustomerActivated(name: string): Promise<void> {
    const s = await this.settings.get();
    if (!s.customerActivated) return;
    await this.push.sendToAll('Customer activated', `${name} is now Active`, { type: 'customerActivated' });
  }

  async notifyInvoicesOverdue(count: number): Promise<void> {
    if (count <= 0) return;
    const s = await this.settings.get();
    if (!s.invoicesOverdue) return;
    await this.push.sendToAll(
      'Invoice overdue',
      count === 1 ? 'An invoice is now overdue' : `${count} invoices are now overdue`,
      { type: 'invoicesOverdue' },
    );
  }

  async notifyInvoiceRead(invoiceNumber: string, customerName?: string): Promise<void> {
    const s = await this.settings.get();
    if (!s.invoicesRead) return;
    const body = customerName ? `${customerName} opened ${invoiceNumber}` : `${invoiceNumber} was opened`;
    await this.push.sendToAll('Invoice read', body, { type: 'invoiceRead' });
  }

  private pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  // Every 5 minutes: once per day, at/after the configured time, send a
  // summary of the day's bookings. lastDigestSentOn guards against repeats.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async dailyDigest(): Promise<void> {
    const s = await this.settings.get();
    if (!s.dailyDigest || !this.push.configured) return;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}-${this.pad(now.getDate())}`;
    if (s.lastDigestSentOn === todayKey) return;
    const nowHhmm = `${this.pad(now.getHours())}:${this.pad(now.getMinutes())}`;
    if (nowHhmm < (s.dailyDigestTime || '07:30')) return;

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayBookings = await this.dayBookingModel
      .find({ date: { $gte: dayStart, $lt: dayEnd } })
      .exec();
    const dogCount = new Set(dayBookings.map((b) => b.animal.toString())).size;
    const appointments = await this.appointmentModel
      .countDocuments({ date: { $gte: dayStart, $lt: dayEnd } })
      .exec();

    const parts: string[] = [];
    parts.push(`${dogCount} dog booking${dogCount === 1 ? '' : 's'}`);
    parts.push(`${appointments} appointment${appointments === 1 ? '' : 's'}`);
    await this.push.sendToAll("Today's schedule", `${parts.join(' and ')} today.`, { type: 'dailyDigest' });
    await this.settings.markDigestSent(todayKey);
    this.logger.log(`Daily digest sent for ${todayKey}`);
  }
}
