import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Animal, AnimalSchema } from '../animals/schemas/animal.schema';
import { ChecklistsModule } from '../checklists/checklists.module';
import { VisitMapping, VisitMappingSchema } from '../settings/schemas/visit-mapping.schema';
import { DayBookingsController } from './day-bookings.controller';
import { DayBookingsService } from './day-bookings.service';
import { DayBooking, DayBookingSchema } from './schemas/day-booking.schema';

@Module({
  imports: [
    // So create() can auto-assign any matching auto-assign checklist
    // template to a booking's date -- see DayBookingsService.create().
    ChecklistsModule,
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
