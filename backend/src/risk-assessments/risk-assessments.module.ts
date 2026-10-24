import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { FormSubmission, FormSubmissionSchema } from '../form-submissions/schemas/form-submission.schema';
import { FormsModule } from '../forms/forms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessInfo, BusinessInfoSchema } from '../settings/schemas/business-info.schema';
import { SettingsModule } from '../settings/settings.module';
import { CustomerRiskAssessmentsController } from './customer-risk-assessments.controller';
import { CustomerRiskAssessmentsService } from './customer-risk-assessments.service';
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
      // Customer risk assessments are FormSubmissions tied to a Customer --
      // models registered directly, the same way BoardingBookingsModule does
      // for incident reports (FormSubmissionsModule imports CustomersModule).
      { name: FormSubmission.name, schema: FormSubmissionSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    // For notifyDueReviews()'s admin-feed + push notification when a live
    // assessment's review comes due.
    NotificationsModule,
    // For sendRiskAssessmentEmail()'s SettingsService.sendTemplatedEmail() call.
    SettingsModule,
    // For CustomerRiskAssessmentsService: the configured form's fields, and
    // the customer's audit log.
    FormsModule,
    AuditLogModule,
  ],
  controllers: [RiskAssessmentsController, CustomerRiskAssessmentsController],
  providers: [RiskAssessmentsService, CustomerRiskAssessmentsService],
  exports: [RiskAssessmentsService],
})
export class RiskAssessmentsModule {}
