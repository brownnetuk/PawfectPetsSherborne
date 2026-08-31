import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Animal, AnimalSchema } from '../animals/schemas/animal.schema';
import { DayBookingsController } from './day-bookings.controller';
import { DayBookingsService } from './day-bookings.service';
import { DayBooking, DayBookingSchema } from './schemas/day-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DayBooking.name, schema: DayBookingSchema },
      // Read-only here -- DayBookingsService.create() looks up the animal's
      // owning customer, same declare-your-own-forFeature approach used
      // elsewhere in this codebase (e.g. BankAccountsModule) to avoid a real
      // circular module dependency.
      { name: Animal.name, schema: AnimalSchema },
    ]),
  ],
  controllers: [DayBookingsController],
  providers: [DayBookingsService],
})
export class DayBookingsModule {}
