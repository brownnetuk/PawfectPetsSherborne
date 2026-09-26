import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessInfo, BusinessInfoSchema } from '../settings/schemas/business-info.schema';
import { RiskAssessmentsController } from './risk-assessments.controller';
import { RiskAssessmentsService } from './risk-assessments.service';
import { RiskAssessment, RiskAssessmentSchema } from './schemas/risk-assessment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RiskAssessment.name, schema: RiskAssessmentSchema },
      // Read/increment only, for the RA{n} counter -- registered directly
      // rather than importing SettingsModule, same "declare your own copy"
      // convention QuotesModule/InvoicesModule/BoardingBookingsModule use.
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
    ]),
    // For notifyDueReviews()'s admin-feed + push notification when a live
    // assessment's review comes due.
    NotificationsModule,
  ],
  controllers: [RiskAssessmentsController],
  providers: [RiskAssessmentsService],
  exports: [RiskAssessmentsService],
})
export class RiskAssessmentsModule {}
