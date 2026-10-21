import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Animal, Species } from '../animals/schemas/animal.schema';
import { Appointment } from '../appointments/schemas/appointment.schema';
import { DayBooking } from '../day-bookings/schemas/day-booking.schema';
import { PushService } from '../push/push.service';
import { VisitMapping } from '../settings/schemas/visit-mapping.schema';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
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
    private readonly customerNotifications: CustomerNotificationsService,
    @InjectModel(DayBooking.name) private readonly dayBookingModel: Model<DayBooking>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<Appointment>,
    @InjectModel(NotificationItem.name) private readonly itemModel: Model<NotificationItem>,
    @InjectModel(VisitMapping.name) private readonly visitMappingModel: Model<VisitMapping>,
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

  async clearAll(): Promise<void> {
    await this.itemModel.deleteMany({}).exec();
  }

  async notifyCustomerActivated(name: string): Promise<void> {
    const s = await this.settings.get();
    if (!s.customerActivated) return;
    await this.dispatch('Customer activated', `${name} is now Active`, 'customerActivated');
  }

  async notifyCustomerUpdated(name?: string): Promise<void> {
    const s = await this.settings.get();
    if (!s.customerUpdated) return;
    await this.dispatch(
      'Customer updated their details',
      `${name || 'A customer'} edited their details in the portal.`,
      'customerUpdated',
    );
  }

  async notifyCustomerPet(
    customerName: string | undefined,
    petName: string | undefined,
    event: 'added' | 'updated',
  ): Promise<void> {
    const s = await this.settings.get();
    if (!s.customerPetUpdated) return;
    const who = customerName || 'A customer';
    const pet = petName || 'a pet';
    await this.dispatch(
      event === 'added' ? 'Pet added' : 'Pet updated',
      event === 'added' ? `${who} added ${pet} in the portal.` : `${who} updated ${pet} in the portal.`,
      event === 'added' ? 'petAdded' : 'petUpdated',
    );
  }

  async notifyFormSubmitted(formName: string, customerName?: string): Promise<void> {
    const s = await this.settings.get();
    if (!s.formSubmitted) return;
    await this.dispatch(
      'Form submitted',
      `${customerName || 'A customer'} submitted "${formName}".`,
      'formSubmitted',
    );
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

  // Pushes a customer (their portal app) about a new or edited invoice/quote.
  // Customer-facing, so not gated by staff NotificationSettings and it doesn't
  // add to the admin feed -- it routes only to that customer's device.
  async notifyCustomerDocument(
    customerId: string,
    kind: 'invoice' | 'quote',
    reference: string,
    event: 'new' | 'updated',
  ): Promise<void> {
    const noun = kind === 'invoice' ? 'invoice' : 'quote';
    const title =
      event === 'new'
        ? kind === 'invoice'
          ? 'New invoice'
          : 'New quote'
        : kind === 'invoice'
          ? 'Invoice updated'
          : 'Quote updated';
    const body =
      event === 'new'
        ? `You've received ${noun} ${reference}.`
        : `Your ${noun} ${reference} has been updated.`;
    // Persist to the customer app's bell feed and push in one step.
    await this.customerNotifications.record(
      customerId,
      title,
      body,
      `${kind}${event === 'new' ? 'Received' : 'Updated'}`,
      reference,
    );
  }

  // Pushes a customer when one of their (already-sent) invoices changes status.
  async notifyCustomerInvoiceStatus(
    customerId: string,
    invoiceNumber: string,
    status: 'paid' | 'overdue' | 'cancelled',
  ): Promise<void> {
    const map = {
      paid: { title: 'Invoice paid', body: `Invoice ${invoiceNumber} is now marked as paid. Thank you!` },
      overdue: { title: 'Invoice overdue', body: `Invoice ${invoiceNumber} is now overdue.` },
      cancelled: { title: 'Invoice cancelled', body: `Invoice ${invoiceNumber} has been cancelled.` },
    } as const;
    const m = map[status];
    await this.customerNotifications.record(
      customerId,
      m.title,
      m.body,
      `invoice${status[0].toUpperCase()}${status.slice(1)}`,
      invoiceNumber,
    );
  }

  // Splits today's DayBookings into visits, day care and boarding using the
  // VisitMapping product slots (Product has no stored category), and names
  // each group's pets by species, e.g. "1 visit (3 cats)". A two-visit
  // product counts as 2 visits. Rows on any other product (travel, extras)
  // aren't a booking of their own and are skipped.
  private digestBookingParts(dayBookings: DayBooking[], mapping: VisitMapping | null): string[] {
    const ids = (...products: (Types.ObjectId | undefined)[]) =>
      new Set(products.filter((p): p is Types.ObjectId => !!p).map(String));
    const oneVisit = ids(
      mapping?.oneVisitWeekdayProduct,
      mapping?.oneVisitWeekendProduct,
      mapping?.oneVisitBankHolidayProduct,
    );
    const twoVisit = ids(
      mapping?.twoVisitWeekdayProduct,
      mapping?.twoVisitWeekendProduct,
      mapping?.twoVisitBankHolidayProduct,
    );
    const dayCare = ids(
      mapping?.dayCareHalfDayProduct,
      mapping?.dayCareFullDayProduct,
      mapping?.dayCareSecondDogHalfDayProduct,
      mapping?.dayCareSecondDogFullDayProduct,
    );
    const boarding = ids(
      mapping?.boardingPerDayProduct,
      mapping?.boardingSecondDogPerDayProduct,
      mapping?.boardingHalfDayProduct,
      mapping?.boardingSecondDogHalfDayProduct,
    );

    let visits = 0;
    const pets = {
      visit: new Map<string, string>(),
      dayCare: new Map<string, string>(),
      boarding: new Map<string, string>(),
    };
    for (const b of dayBookings) {
      const product = String(b.product);
      let group: keyof typeof pets;
      if (oneVisit.has(product) || twoVisit.has(product)) {
        group = 'visit';
        visits += twoVisit.has(product) ? 2 : 1;
      } else if (dayCare.has(product)) group = 'dayCare';
      else if (boarding.has(product)) group = 'boarding';
      else continue;
      for (const a of [b.animal, ...(b.additionalAnimals ?? [])] as unknown as (Animal | null)[]) {
        if (a) pets[group].set(String(a._id), a.species);
      }
    }

    const parts: string[] = [];
    if (visits > 0) parts.push(`${visits} visit${visits === 1 ? '' : 's'} (${this.speciesSummary(pets.visit)})`);
    if (pets.dayCare.size > 0) parts.push(`day care for ${this.speciesSummary(pets.dayCare)}`);
    if (pets.boarding.size > 0) parts.push(`boarding for ${this.speciesSummary(pets.boarding)}`);
    if (parts.length === 0) parts.push('no bookings');
    return parts;
  }

  // "3 cats", "2 dogs and 1 cat" -- species other than dog/cat count as pets.
  private speciesSummary(pets: Map<string, string>): string {
    const counts = new Map<string, number>();
    for (const species of pets.values()) {
      const noun = species === Species.DOG || species === Species.CAT ? species : 'pet';
      counts.set(noun, (counts.get(noun) ?? 0) + 1);
    }
    return this.joinList(
      ['dog', 'cat', 'pet']
        .filter((noun) => counts.has(noun))
        .map((noun) => `${counts.get(noun)} ${noun}${counts.get(noun) === 1 ? '' : 's'}`),
    );
  }

  private joinList(items: string[]): string {
    return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
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
      .populate('animal', 'species')
      .populate('additionalAnimals', 'species')
      .exec();
    const mapping = await this.visitMappingModel.findOne().exec();
    const appointments = await this.appointmentModel
      .countDocuments({ date: { $gte: dayStart, $lt: dayEnd } })
      .exec();

    const parts = this.digestBookingParts(dayBookings, mapping);
    parts.push(`${appointments} appointment${appointments === 1 ? '' : 's'}`);
    await this.dispatch("Today's schedule", `${this.joinList(parts)} today.`, 'dailyDigest');
    await this.settings.markDigestSent(todayKey);
    this.logger.log(`Daily digest sent for ${todayKey}`);
  }
}
