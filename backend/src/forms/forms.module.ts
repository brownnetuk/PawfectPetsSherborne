import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import {
  BoardingWorkflowSettings,
  BoardingWorkflowSettingsSchema,
} from '../settings/schemas/boarding-workflow-settings.schema';
import { Form, FormSchema } from './schemas/form.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Form.name, schema: FormSchema },
      // Registered directly (not by importing SettingsModule) -- only so the
      // first seed of the "Incident Report" form can point Settings >
      // Boarding's incident report picker at it (FormsService.onModuleInit()).
      { name: BoardingWorkflowSettings.name, schema: BoardingWorkflowSettingsSchema },
    ]),
  ],
  controllers: [FormsController],
  providers: [FormsService],
  exports: [FormsService, MongooseModule],
})
export class FormsModule {}
