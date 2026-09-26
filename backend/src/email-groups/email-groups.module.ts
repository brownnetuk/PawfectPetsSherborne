import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailGroupsController } from './email-groups.controller';
import { EmailGroupsService } from './email-groups.service';
import { EmailGroup, EmailGroupSchema } from './schemas/email-group.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: EmailGroup.name, schema: EmailGroupSchema }])],
  controllers: [EmailGroupsController],
  providers: [EmailGroupsService],
  exports: [EmailGroupsService, MongooseModule],
})
export class EmailGroupsModule {}
