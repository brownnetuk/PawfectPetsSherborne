import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankHolidaysController } from './bank-holidays.controller';
import { BankHolidaysService } from './bank-holidays.service';
import { BankHoliday, BankHolidaySchema } from './schemas/bank-holiday.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: BankHoliday.name, schema: BankHolidaySchema }])],
  controllers: [BankHolidaysController],
  providers: [BankHolidaysService],
})
export class BankHolidaysModule {}
