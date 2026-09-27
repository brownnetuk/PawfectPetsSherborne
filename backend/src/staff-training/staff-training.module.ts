import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { Staff, StaffSchema } from '../staff/schemas/staff.schema';
import { MyTrainingController } from './my-training.controller';
import { TrainingAttempt, TrainingAttemptSchema } from './schemas/training-attempt.schema';
import { TrainingModule as TrainingModuleSchemaClass, TrainingModuleSchema } from './schemas/training-module.schema';
import { TrainingAttemptsService } from './training-attempts.service';
import { TrainingModulesController } from './training-modules.controller';
import { TrainingModulesService } from './training-modules.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrainingModuleSchemaClass.name, schema: TrainingModuleSchema },
      { name: TrainingAttempt.name, schema: TrainingAttemptSchema },
      // Read-only here, for the assignment picker and "All Staff" reconcile
      // -- registered directly rather than importing StaffModule, same
      // "declare your own copy" convention PoliciesModule/RiskAssessmentsModule use.
      { name: Staff.name, schema: StaffSchema },
    ]),
    // For reconcileAndNotify()'s admin-feed + push notification.
    NotificationsModule,
  ],
  controllers: [TrainingModulesController, MyTrainingController],
  providers: [TrainingModulesService, TrainingAttemptsService],
  exports: [TrainingModulesService],
})
export class StaffTrainingModule {}
