import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BusinessInfo, BusinessInfoSchema } from './schemas/business-info.schema';
import { EmailSettings, EmailSettingsSchema } from './schemas/email-settings.schema';
import { EmailTemplate, EmailTemplateSchema } from './schemas/email-template.schema';
import { VisitMapping, VisitMappingSchema } from './schemas/visit-mapping.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
      { name: EmailSettings.name, schema: EmailSettingsSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: VisitMapping.name, schema: VisitMappingSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
