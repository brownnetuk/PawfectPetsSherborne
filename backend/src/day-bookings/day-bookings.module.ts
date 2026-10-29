import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Animal, AnimalSchema } from '../animals/schemas/animal.schema';
import { ChecklistsModule } from '../checklists/checklists.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { InvoicesModule } from '../invoices/invoices.module';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { VisitMapping, VisitMappingSchema } from '../settings/schemas/visit-mapping.schema';
import { DayBookingsController } from './day-bookings.controller';
import { DayBookingsService } from './day-bookings.service';
import { DayBooking, DayBookingSchema } from './schemas/day-booking.schema';

@Module({
  imports: [
    // So create() can auto-assign any matching auto-assign checklist
    // template to a booking's date -- see DayBookingsService.create().
    ChecklistsModule,
    // So a change to an invoiced booking can update its unsent invoice's
    // lines -- see DayBookingsService.syncInvoiceLines(). Also brings the
    // Invoice model (InvoicesModule exports its MongooseModule).
    InvoicesModule,
    MongooseModule.forFeature([
      { name: DayBooking.name, schema: DayBookingSchema },
      // Read-only here -- DayBookingsService.create() looks up the animal's
      // owning customer, same declare-your-own-forFeature approach used
      // elsewhere in this codebase (e.g. BankAccountsModule) to avoid a real
      // circular module dependency.
      { name: Animal.name, schema: AnimalSchema },
      // Read-only too -- computeBoardingPlan() resolves the boarding/day-care
      // products from the single VisitMapping doc.
      { name: VisitMapping.name, schema: VisitMappingSchema },
      // Read-only, for the invoice line sync's product names/prices and the
      // customer's travel product.
      { name: Product.name, schema: ProductSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [DayBookingsController],
  providers: [DayBookingsService],
  // So QuotesService and the new BoardingBookingsService can share
  // createDayCareStay()/createBoardingStay() instead of each re-implementing
  // the boarding day/product rounding math.
  exports: [DayBookingsService],
})
export class DayBookingsModule {}
