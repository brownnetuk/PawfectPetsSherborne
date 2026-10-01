import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BookingsModule } from '../bookings/bookings.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';
import { Animal, AnimalSchema } from './schemas/animal.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Animal.name, schema: AnimalSchema },
      // Needed so AnimalsService can validate a copy/move's target customer
      // exists -- same "register it again here" pattern as other modules
      // that only need the Customer model, not the whole CustomersModule
      // (see boarding-bookings.module.ts's own comment on this).
      { name: Customer.name, schema: CustomerSchema },
    ]),
    // Needed so AnimalsService can check for Bookings referencing an animal before deleting it.
    BookingsModule,
    AuditLogModule,
  ],
  controllers: [AnimalsController],
  providers: [AnimalsService],
  exports: [AnimalsService, MongooseModule],
})
export class AnimalsModule {}
