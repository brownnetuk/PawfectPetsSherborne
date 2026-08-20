import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Staff, StaffSchema } from './schemas/staff.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Staff.name, schema: StaffSchema }])],
  exports: [MongooseModule],
})
export class StaffModule {}
