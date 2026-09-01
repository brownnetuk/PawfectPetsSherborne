import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Appointment } from '../appointments/schemas/appointment.schema';
import { DayBooking } from '../day-bookings/schemas/day-booking.schema';
import { PushService } from '../push/push.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationItem } from './schemas/notification-item.schema';

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
    @InjectModel(NotificationItem.name) private readonly itemModel: Model<NotificationItem>,
  ) {}

  // Records the notification in the admin feed and pushes it to phones. Every
  // notification goes through here so the two stay in sync.
  async dispatch(title: string, body: string, type: string): Promise<void> {
    await this.itemModel.create({ title, body, type });
    await this.push.sendToAll(title, body, { type });
  }

  // --- feed (admin notification centre) ---
  listRecent(limit = 50): Promise<NotificationItem[]> {
    return this.itemModel.find().sort({ createdAt: -1 }).limit(limit).exec();
  }

  unreadCount(): Promise<number> {
    return this.itemModel.countDocuments({ read: false }).exec();
  }

  async markAllRead(): Promise<void> {
    await this.itemModel.updateMany({ read: false }, { read: true }).exec();
  }

  async notifyCustomerActivated(name: string): Promise<void> {
    const s = await this.settings.get();
    if (!s.customerActivated) return;
    await this.dispatch('Customer activated', `${name} is now Active`, 'customerActivated');
  }

  async notifyInvoicesOverdue(count: number): Promise<void> {
    if (count <= 0) return;
    const s = await this.settings.get();
    if (!s.invoicesOverdue) return;
    await this.dispatch(
      'Invoice overdue',
      count === 1 ? 'An invoice is now overdue' : `${count} invoices are now overdue`,
      'invoicesOverdue',
    );
  }

  async notifyInvoiceRead(invoiceNumber: string, customerName?: string): Promise<void> {
    const s = await this.settings.get();
    if (!s.invoicesRead) return;
    const body = customerName ? `${customerName} opened ${invoiceNumber}` : `${invoiceNumber} was opened`;
    await this.dispatch('Invoice read', body, 'invoiceRead');
  }

  // Pushes a customer (their portal app) about an invoice/quote just sent to
  // them. Customer-facing, so not gated by staff NotificationSettings and it
  // doesn't add to the admin feed -- it routes only to that customer's device.
  async notifyCustomerDocumentReceived(
    customerId: string,
    kind: 'invoice' | 'quote',
    reference: string,
  ): Promise<void> {
    const title = kind === 'invoice' ? 'New invoice' : 'New quote';
    await this.push.sendToCustomer(
      customerId,
      title,
      `You've received ${kind} ${reference}.`,
      { type: `${kind}Received`, reference },
    );
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
    await this.dispatch("Today's schedule", `${parts.join(' and ')} today.`, 'dailyDigest');
    await this.settings.markDigestSent(todayKey);
    this.logger.log(`Daily digest sent for ${todayKey}`);
  }
}
