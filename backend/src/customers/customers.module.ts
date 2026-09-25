import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnimalsModule } from '../animals/animals.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BoardingBooking, BoardingBookingSchema } from '../boarding-bookings/schemas/boarding-booking.schema';
import { BoardingBookingsModule } from '../boarding-bookings/boarding-bookings.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CreditNote, CreditNoteSchema } from '../credit-notes/schemas/credit-note.schema';
import { CreditNotesModule } from '../credit-notes/credit-notes.module';
import { CrmModule } from '../crm/crm.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { PaymentsModule } from '../payments/payments.module';
import { QuotesModule } from '../quotes/quotes.module';
import { SettingsModule } from '../settings/settings.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer, CustomerSchema } from './schemas/customer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      // Read-only here -- force-delete's cascade (CustomersService.remove()'s
      // force option) only needs to *find* which payments/credit notes/
      // boarding bookings exist for a customer before removing each one
      // properly via the services below, same "declare your own copy"
      // convention BoardingBookingsModule already uses for these same models.
      { name: Payment.name, schema: PaymentSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
      { name: BoardingBooking.name, schema: BoardingBookingSchema },
    ]),
    // Needed so CustomersService can check for Animals/Bookings/Invoices/Quotes/CRM
    // activity referencing a customer before deleting it, and (for force-delete)
    // remove each one properly via its own service.
    AnimalsModule,
    BookingsModule,
    InvoicesModule,
    PaymentsModule,
    CreditNotesModule,
    QuotesModule,
    BoardingBookingsModule,
    CrmModule,
    AuditLogModule,
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService, MongooseModule],
})
export class CustomersModule {}
