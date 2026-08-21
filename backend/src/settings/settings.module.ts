import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailSettings, EmailSettingsSchema } from './schemas/email-settings.schema';
import { EmailTemplate, EmailTemplateSchema } from './schemas/email-template.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailSettings.name, schema: EmailSettingsSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
