import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChecklistAssignmentsController, ChecklistTemplatesController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';
import { ChecklistAssignment, ChecklistAssignmentSchema } from './schemas/checklist-assignment.schema';
import { ChecklistTemplate, ChecklistTemplateSchema } from './schemas/checklist-template.schema';

@Module({
  imports: [
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
