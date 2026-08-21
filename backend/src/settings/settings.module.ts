import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailSettings, EmailSettingsSchema } from './schemas/email-settings.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: EmailSettings.name, schema: EmailSettingsSchema }])],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
