import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsModule } from '../bookings/bookings.module';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';
import { Animal, AnimalSchema } from './schemas/animal.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Animal.name, schema: AnimalSchema }]),
    // Needed so AnimalsService can check for Bookings referencing an animal before deleting it.
    BookingsModule,
  ],
  controllers: [AnimalsController],
  providers: [AnimalsService],
  exports: [AnimalsService, MongooseModule],
})
export class AnimalsModule {}
