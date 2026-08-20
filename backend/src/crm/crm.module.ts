import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmActivity, CrmActivitySchema } from './schemas/crm-activity.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CrmActivity.name, schema: CrmActivitySchema }]),
  ],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService, MongooseModule],
})
export class CrmModule {}
