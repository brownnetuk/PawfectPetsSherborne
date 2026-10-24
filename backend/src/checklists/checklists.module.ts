import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChecklistAssignmentsController, ChecklistTemplatesController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';
import { ChecklistAssignment, ChecklistAssignmentSchema } from './schemas/checklist-assignment.schema';
import { ChecklistTemplate, ChecklistTemplateSchema } from './schemas/checklist-template.schema';

@Module({
  imports: [
    // For the "due in an hour" staff reminder (ChecklistsService.sendDueReminders).
    NotificationsModule,
    MongooseModule.forFeature([
      { name: ChecklistTemplate.name, schema: ChecklistTemplateSchema },
      { name: ChecklistAssignment.name, schema: ChecklistAssignmentSchema },
    ]),
  ],
  controllers: [ChecklistTemplatesController, ChecklistAssignmentsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
