import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnualLeaveController } from './annual-leave.controller';
import { AnnualLeaveService } from './annual-leave.service';
import { AnnualLeave, AnnualLeaveSchema } from './schemas/annual-leave.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: AnnualLeave.name, schema: AnnualLeaveSchema }])],
  controllers: [AnnualLeaveController],
  providers: [AnnualLeaveService],
})
export class AnnualLeaveModule {}
