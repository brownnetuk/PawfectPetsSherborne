import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Animal, AnimalSchema } from '../animals/schemas/animal.schema';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BankHoliday, BankHolidaySchema } from '../bank-holidays/schemas/bank-holiday.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { DayBooking, DayBookingSchema } from '../day-bookings/schemas/day-booking.schema';
import { InvoiceTerm, InvoiceTermSchema } from '../invoice-terms/schemas/invoice-term.schema';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisitMapping, VisitMappingSchema } from '../settings/schemas/visit-mapping.schema';
import {
  BusinessInfo,
  BusinessInfoSchema,
} from '../settings/schemas/business-info.schema';
import { SettingsModule } from '../settings/settings.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { Quote, QuoteSchema } from './schemas/quote.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quote.name, schema: QuoteSchema },
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
      // Registered here too (not just CustomersModule) so QuotesService can
      // resolve-or-create a real Customer when a manual-customer quote is
      // accepted, without importing CustomersModule -- which already imports
      // QuotesModule (for its own delete-guard checks) and would circularize.
      { name: Customer.name, schema: CustomerSchema },
      // Read-only, so acceptAndConvert() can look up the default term's
      // due-date rule without importing InvoiceTermsModule (which exports
      // nothing today) just for that.
      { name: InvoiceTerm.name, schema: InvoiceTermSchema },
      // For acceptAndConvert() turning a persisted visit plan into calendar
      // bookings -- registered directly (same pattern as Customer above)
      // rather than importing DayBookingsModule and friends just for their
      // models.
      { name: DayBooking.name, schema: DayBookingSchema },
      { name: Animal.name, schema: AnimalSchema },
      { name: VisitMapping.name, schema: VisitMappingSchema },
      { name: BankHoliday.name, schema: BankHolidaySchema },
    ]),
    SettingsModule,
    AuditLogModule,
    // For InvoicesService -- a quote accepted on its public page is turned
    // into a real Invoice (see QuotesService.acceptAndConvert()). Safe
    // direction: InvoicesModule doesn't import QuotesModule.
    InvoicesModule,
    // For pushing the customer's portal app when a quote is emailed to them.
    NotificationsModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService, MongooseModule],
})
export class QuotesModule {}
