import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { NotificationService } from '../notifications/notification.service';
import { AssignChecklistDto } from './dto/assign-checklist.dto';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistAssignmentDto } from './dto/update-checklist-assignment.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';
import { ChecklistAssignment } from './schemas/checklist-assignment.schema';
import { ChecklistCategory, ChecklistTemplate } from './schemas/checklist-template.schema';

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

// How far ahead of a checklist's complete-by time staff are reminded that
// it still has unticked items.
export const CHECKLIST_REMINDER_LEAD_MS = 60 * 60 * 1000;

// The instant a day's checklist is due: its assigned day (local midnight)
// plus its "HH:mm" complete-by time, in the server's local time -- the same
// convention NotificationService.dailyDigest uses for dailyDigestTime. Null
// when the checklist has no complete-by time or it isn't a valid HH:mm.
export function checklistDueAt(assignment: { date: Date; completeByTime?: string }): Date | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((assignment.completeByTime ?? '').trim());
  if (!match) return null;
  const due = toDayStart(assignment.date);
  due.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return due;
}

// Whether the "due soon" reminder should go out now: the checklist is due
// within the lead time (or already past due), and nothing has been sent for
// it yet. Pure, so the cron's timing rule is unit-testable.
export function checklistReminderDue(
  assignment: { date: Date; completeByTime?: string; reminderSentAt?: Date },
  now: Date,
  leadMs = CHECKLIST_REMINDER_LEAD_MS,
): boolean {
  if (assignment.reminderSentAt) return false;
  const due = checklistDueAt(assignment);
  if (!due) return false;
  return now.getTime() >= due.getTime() - leadMs;
}

@Injectable()
export class ChecklistsService {
  private readonly logger = new Logger(ChecklistsService.name);

  constructor(
    @InjectModel(ChecklistTemplate.name) private readonly templateModel: Model<ChecklistTemplate>,
    @InjectModel(ChecklistAssignment.name) private readonly assignmentModel: Model<ChecklistAssignment>,
    private readonly notifications: NotificationService,
  ) {}

  // Staff reminder an hour before a checklist's complete-by time if it still
  // has unticked items. Only ever looks at checklists assigned to today, so
  // a template's time means nothing on days it hasn't been assigned. Each
  // assignment is reminded at most once (reminderSentAt); a checklist that
  // is already finished by then is marked without a push so it isn't
  // re-scanned every five minutes.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDueReminders(): Promise<void> {
    const now = new Date();
    const today = toDayStart(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const candidates = await this.assignmentModel
      .find({
        date: { $gte: today, $lt: tomorrow },
        completeByTime: { $exists: true, $nin: [null, ''] },
        reminderSentAt: { $exists: false },
      })
      .exec();
    for (const assignment of candidates) {
      if (!checklistReminderDue(assignment, now)) continue;
      const remaining = assignment.items.filter((_, i) => !assignment.completed[i]).length;
      try {
        if (remaining > 0) {
          await this.notifications.notifyChecklistDue(assignment.name, assignment.completeByTime!, remaining);
        }
        await this.assignmentModel.updateOne({ _id: assignment._id }, { reminderSentAt: now }).exec();
      } catch (err) {
        // Leave reminderSentAt unset so the next run retries this one.
        this.logger.error(`Checklist reminder for "${assignment.name}" failed: ${String(err)}`);
      }
    }
  }

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
    return this.createAssignment(template, toDayStart(dto.date));
  }

  private createAssignment(template: ChecklistTemplate, date: Date): Promise<ChecklistAssignment> {
    return new this.assignmentModel({
      template: template._id,
      category: template.category,
      name: template.name,
      completeByTime: template.completeByTime,
      items: template.items,
      date,
      completed: template.items.map(() => false),
      completedBy: template.items.map(() => null),
    }).save();
  }

  // Called by DayBookingsService whenever a booking is created/dated, so any
  // auto-assign template matching that booking's category -- and a part of
  // the day the dog is actually in for (AM/PM/either for 'allDay') -- gets a
  // copy on that day, unless one's already there (from a previous booking
  // that day, or a staff member assigning it by hand).
  async autoAssignForDate(
    date: Date,
    category: ChecklistCategory,
    presence: { am: boolean; pm: boolean },
  ): Promise<void> {
    const templates = await this.templateModel.find({ category, autoAssign: true }).exec();
    for (const template of templates) {
      const session = template.session ?? 'allDay';
      const wanted = session === 'AM' ? presence.am : session === 'PM' ? presence.pm : presence.am || presence.pm;
      if (!wanted) continue;
      const exists = await this.assignmentModel.exists({ template: template._id, date });
      if (exists) continue;
      await this.createAssignment(template, date);
    }
  }

  async toggleItem(id: string, index: number, actor: string): Promise<ChecklistAssignment> {
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException(`Checklist assignment ${id} not found`);
    }
    if (!Number.isInteger(index) || index < 0 || index >= assignment.items.length) {
      throw new BadRequestException('Invalid item index');
    }
    const nowDone = !assignment.completed[index];
    assignment.completed[index] = nowDone;
    assignment.completedBy[index] = nowDone ? actor : null;
    assignment.markModified('completed');
    assignment.markModified('completedBy');
    return assignment.save();
  }

  async updateAssignment(id: string, dto: UpdateChecklistAssignmentDto, actor: string): Promise<ChecklistAssignment> {
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException(`Checklist assignment ${id} not found`);
    }
    if (dto.notes !== undefined) {
      assignment.notes = dto.notes;
    }
    if (dto.signatureImage !== undefined) {
      assignment.signatureImage = dto.signatureImage || undefined;
      assignment.signedBy = dto.signatureImage ? actor : undefined;
      assignment.signedAt = dto.signatureImage ? new Date() : undefined;
    }
    if (dto.signedAt !== undefined) {
      if (!assignment.signatureImage) {
        throw new BadRequestException('This checklist has not been signed yet');
      }
      assignment.signedAt = new Date(dto.signedAt);
    }
    return assignment.save();
  }

  async removeAssignment(id: string): Promise<void> {
    const result = await this.assignmentModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Checklist assignment ${id} not found`);
    }
  }
}
