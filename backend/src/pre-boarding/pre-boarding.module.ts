import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EmailTemplate,
  EmailTemplateSchema,
} from '../settings/schemas/email-template.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { PreBoardingController } from './pre-boarding.controller';
import { PreBoardingService } from './pre-boarding.service';
import {
  PreBoardingForm,
  PreBoardingFormSchema,
} from './schemas/pre-boarding-form.schema';
import {
  PreBoardingSettings,
  PreBoardingSettingsSchema,
} from './schemas/pre-boarding-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PreBoardingSettings.name, schema: PreBoardingSettingsSchema },
      { name: PreBoardingForm.name, schema: PreBoardingFormSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
    ]),
    SettingsModule,
    NotificationsModule,
  ],
  controllers: [PreBoardingController],
  providers: [PreBoardingService],
})
export class PreBoardingModule {}
