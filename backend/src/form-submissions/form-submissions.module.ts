import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnimalsModule } from '../animals/animals.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CustomersModule } from '../customers/customers.module';
import { FormsModule } from '../forms/forms.module';
import { FormSubmissionsController } from './form-submissions.controller';
import { FormSubmissionsService } from './form-submissions.service';
import {
  FormSubmission,
  FormSubmissionSchema,
} from './schemas/form-submission.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FormSubmission.name, schema: FormSubmissionSchema },
    ]),
    FormsModule,
    CustomersModule,
    AnimalsModule,
    AuditLogModule,
  ],
  controllers: [FormSubmissionsController],
  providers: [FormSubmissionsService],
  exports: [FormSubmissionsService, MongooseModule],
})
export class FormSubmissionsModule {}
