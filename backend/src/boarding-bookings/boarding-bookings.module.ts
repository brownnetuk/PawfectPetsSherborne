import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Animal, AnimalSchema } from '../animals/schemas/animal.schema';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CreditNote, CreditNoteSchema } from '../credit-notes/schemas/credit-note.schema';
import { CreditNotesModule } from '../credit-notes/credit-notes.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { DayBookingsModule } from '../day-bookings/day-bookings.module';
import {
  FormSubmission,
  FormSubmissionSchema,
} from '../form-submissions/schemas/form-submission.schema';
import { FormsModule } from '../forms/forms.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { PaymentsModule } from '../payments/payments.module';
import {
  BusinessInfo,
  BusinessInfoSchema,
} from '../settings/schemas/business-info.schema';
import { SettingsModule } from '../settings/settings.module';
import { BoardingBookingsController } from './boarding-bookings.controller';
import { BoardingBookingsService } from './boarding-bookings.service';
import { BoardingBooking, BoardingBookingSchema } from './schemas/boarding-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BoardingBooking.name, schema: BoardingBookingSchema },
      // Read-only, for the booking reference counter -- registered directly
      // rather than importing SettingsModule's own forFeature, same
      // "declare your own copy" convention QuotesModule/InvoicesModule use.
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
      // Registered directly (not by importing FormSubmissionsModule) --
      // FormSubmissionsModule imports CustomersModule, which sits upstream
      // of this module (Customers -> Animals -> Bookings -> Quotes ->
      // BoardingBookings), so importing it here would be circular. See
      // BoardingBookingsService.sendPreCheckIn()'s comment.
      { name: FormSubmission.name, schema: FormSubmissionSchema },
      // Same reasoning as FormSubmission above -- read-only here (pre-check-in
      // pre-fill), so there's no need for CustomersModule/AnimalsModule's
      // full services (validation, audit logging), just their models.
      { name: Customer.name, schema: CustomerSchema },
      { name: Animal.name, schema: AnimalSchema },
      // Read-only here too -- "Delete all" (BoardingBookingsService.remove())
      // only needs to *find* which payments/credit notes exist against an
      // invoice before deleting each one properly via PaymentsService/
      // CreditNotesModule below.
      { name: Payment.name, schema: PaymentSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
    ]),
    // For DayBookingsService.createDayCareStay()/createBoardingStay() --
    // the single place both this module and QuotesModule now build a stay's
    // DayBooking rows.
    DayBookingsModule,
    InvoicesModule,
    // For "Delete all" (BoardingBookingsService.remove()) to reverse and
    // remove a blocking payment/credit note the proper way (invoice balance,
    // bank balance, linked expense, audit log) rather than raw-deleting the
    // documents -- safe to import directly, neither sits upstream of this
    // module (PaymentsModule/CreditNotesModule -> InvoicesModule only).
    PaymentsModule,
    CreditNotesModule,
    // Just for FormsService.findOne() (a form's fields, for the pre-check-in
    // submission snapshot) -- a leaf module, safe to import directly.
    FormsModule,
    SettingsModule,
    AuditLogModule,
  ],
  controllers: [BoardingBookingsController],
  providers: [BoardingBookingsService],
  exports: [BoardingBookingsService],
})
export class BoardingBookingsModule {}
