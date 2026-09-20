import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AssignChecklistDto } from './dto/assign-checklist.dto';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistAssignmentDto } from './dto/update-checklist-assignment.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';
import { ChecklistAssignment } from './schemas/checklist-assignment.schema';
import { ChecklistTemplate } from './schemas/checklist-template.schema';

// Same local-midnight parsing DayBookingsService.toDayStart uses, so a
// checklist assigned to a date lines up with how every other calendar-y
// date field in this app is stored/queried.
function toDayStart(date: string | Date): Date {
  if (typeof date === 'string') {
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectModel(ChecklistTemplate.name) private readonly templateModel: Model<ChecklistTemplate>,
    @InjectModel(ChecklistAssignment.name) private readonly assignmentModel: Model<ChecklistAssignment>,
  ) {}

  // --- templates (Settings > Boarding > Checklists) ---

  listTemplates(): Promise<ChecklistTemplate[]> {
    return this.templateModel.find().sort({ name: 1 }).exec();
  }

  createTemplate(dto: CreateChecklistTemplateDto): Promise<ChecklistTemplate> {
    return new this.templateModel(dto).save();
  }

  async updateTemplate(id: string, dto: UpdateChecklistTemplateDto): Promise<ChecklistTemplate> {
    const template = await this.templateModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!template) {
      throw new NotFoundException(`Checklist template ${id} not found`);
    }
    return template;
  }

  async removeTemplate(id: string): Promise<void> {
    const result = await this.templateModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Checklist template ${id} not found`);
    }
    // Deliberately doesn't touch existing assignments -- they already hold
    // their own name/items snapshot from assignment time, same reasoning as
    // every other snapshot-not-reference relationship in this app.
  }

  // --- assignments (Boarding & DayCare > Checklists calendar) ---

  findAssignmentsForRange(from: string, to: string): Promise<ChecklistAssignment[]> {
    return this.assignmentModel
      .find({ date: { $gte: toDayStart(from), $lt: toDayStart(to) } })
      .sort({ date: 1 })
      .exec();
  }

  async assign(dto: AssignChecklistDto): Promise<ChecklistAssignment> {
    const template = await this.templateModel.findById(dto.template).exec();
    if (!template) {
      throw new BadRequestException(`Checklist template ${dto.template} not found`);
    }
    return new this.assignmentModel({
      template: template._id,
      name: template.name,
      items: template.items,
      date: toDayStart(dto.date),
      completed: template.items.map(() => false),
    }).save();
  }

  async updateAssignment(id: string, dto: UpdateChecklistAssignmentDto): Promise<ChecklistAssignment> {
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException(`Checklist assignment ${id} not found`);
    }
    if (dto.completed.length !== assignment.items.length) {
      throw new BadRequestException('completed must have one entry per item');
    }
    assignment.completed = dto.completed;
    return assignment.save();
  }

  async removeAssignment(id: string): Promise<void> {
    const result = await this.assignmentModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Checklist assignment ${id} not found`);
    }
  }
}
