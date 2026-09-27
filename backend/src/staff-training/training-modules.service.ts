import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { NotificationService } from '../notifications/notification.service';
import { Staff } from '../staff/schemas/staff.schema';
import { AssignTrainingUsersDto } from './dto/assign-training-users.dto';
import { CreateTrainingModuleDto } from './dto/create-training-module.dto';
import { UpdateTrainingModuleDto } from './dto/update-training-module.dto';
import { TrainingAssignment, TrainingModule } from './schemas/training-module.schema';
import { TrainingAttempt } from './schemas/training-attempt.schema';

export type ComplianceStatus = 'compliant' | 'due' | 'overdue' | 'pending';

// A staff member is "due soon" (rather than simply "pending", further out)
// inside this window -- no existing "due soon" precedent elsewhere in the
// codebase to match, so this is a fresh, deliberately small constant.
const DUE_SOON_DAYS = 7;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay);
}

// Same interval math as RiskAssessmentsService/PoliciesService's own copies --
// kept as its own copy for the same "otherwise unrelated modules" reasoning.
function addReviewInterval(frequency: TrainingModule['reviewFrequency']): string {
  const d = new Date();
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case '6-monthly':
      d.setMonth(d.getMonth() + 6);
      break;
    case 'annually':
      d.setFullYear(d.getFullYear() + 1);
      break;
    case 'monthly':
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

// Shared by the compliance audit view, the hourly cron, and /training/my's
// per-module status -- one place decides what "compliant" means.
export function computeComplianceStatus(a: TrainingAssignment): ComplianceStatus {
  const effectiveDue = a.lastCompletedAt ? a.nextDueDate : a.dueDate;
  if (!effectiveDue) return 'pending';
  const days = daysBetween(today(), effectiveDue);
  if (days < 0) return 'overdue';
  if (!a.lastPassed) return days <= DUE_SOON_DAYS ? 'due' : 'pending';
  return days <= DUE_SOON_DAYS ? 'due' : 'compliant';
}

@Injectable()
export class TrainingModulesService {
  constructor(
    @InjectModel(TrainingModule.name) private readonly moduleModel: Model<TrainingModule>,
    @InjectModel(TrainingAttempt.name) private readonly attemptModel: Model<TrainingAttempt>,
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
    private readonly notificationService: NotificationService,
  ) {}

  findAll(): Promise<TrainingModule[]> {
    return this.moduleModel.find().sort({ name: 1 }).exec();
  }

  async findOne(id: string): Promise<TrainingModule> {
    const module = await this.moduleModel.findById(id).exec();
    if (!module) {
      throw new NotFoundException(`Training module ${id} not found`);
    }
    return module;
  }

  // Gated (see TrainingModulesController) -- unlike Policies' equivalent,
  // this whole surface (including question-bank answers) must stay behind
  // training.manage, so the staff picker does too.
  listStaffOptions(): Promise<{ _id: unknown; name: string }[]> {
    return this.staffModel.find({ locked: { $ne: true } }).select('name').exec();
  }

  // --- /training/my/* (self-service, ungated -- see MyTrainingController) ---
  // Both methods deliberately never touch questionBank -- a staff member
  // browsing their own assigned modules must never see the answers.

  async listAssignedTo(staffId: string): Promise<
    Array<{ module: TrainingModule; assignment: TrainingAssignment; status: ComplianceStatus }>
  > {
    const modules = await this.moduleModel
      .find({ status: 'live', 'assignments.staff': staffId })
      .select('name description contentBlocks passMarkPercent questionsPerAttempt assignments')
      .exec();
    return modules.map((module) => {
      const assignment = module.assignments.find((a) => String(a.staff) === staffId)!;
      return { module, assignment, status: computeComplianceStatus(assignment) };
    });
  }

  async findOneAssignedTo(id: string, staffId: string): Promise<{ module: TrainingModule; assignment: TrainingAssignment; status: ComplianceStatus }> {
    const module = await this.moduleModel
      .findOne({ _id: id, status: 'live' })
      .select('name description contentBlocks passMarkPercent questionsPerAttempt assignments')
      .exec();
    const assignment = module?.assignments.find((a) => String(a.staff) === staffId);
    if (!module || !assignment) {
      throw new NotFoundException('This training module is not assigned to you.');
    }
    return { module, assignment, status: computeComplianceStatus(assignment) };
  }

  // Called by TrainingAttemptsService.submitAttempt() once an attempt is
  // graded, to update the cached status row.
  async recordAttemptResult(
    moduleId: string,
    staffId: string,
    scorePercent: number,
    passed: boolean,
  ): Promise<TrainingModule> {
    const module = await this.findOne(moduleId);
    const assignment = module.assignments.find((a) => String(a.staff) === staffId);
    if (!assignment) {
      throw new NotFoundException('This training module is not assigned to you.');
    }
    assignment.lastAttemptAt = new Date();
    assignment.lastScorePercent = scorePercent;
    assignment.lastPassed = passed;
    assignment.lastCompletedAt = today();
    if (passed) {
      assignment.nextDueDate = addReviewInterval(module.reviewFrequency);
      assignment.reviewDueNotified = false;
    }
    module.auditLog.push({
      action: 'Quiz Completed',
      changes: `${assignment.staffName} scored ${scorePercent}% (${passed ? 'Pass' : 'Fail'})`,
      actor: assignment.staffName,
      at: new Date(),
    });
    await module.save();
    return module;
  }

  private validateLiveReadiness(module: Pick<TrainingModule, 'status' | 'questionBank' | 'questionsPerAttempt'>): void {
    if (module.status !== 'live') return;
    if (module.questionBank.length === 0) {
      throw new BadRequestException('Add at least one question before making this module live.');
    }
    if (module.questionsPerAttempt > module.questionBank.length) {
      throw new BadRequestException('Questions per attempt can\'t be more than the size of the question bank.');
    }
  }

  async create(dto: CreateTrainingModuleDto, actor: string): Promise<TrainingModule> {
    const module = new this.moduleModel({
      name: dto.name,
      description: dto.description,
      status: dto.status ?? 'draft',
      contentBlocks: dto.contentBlocks ?? [],
      questionBank: dto.questionBank ?? [],
      passMarkPercent: dto.passMarkPercent ?? 80,
      questionsPerAttempt: dto.questionsPerAttempt ?? 5,
      reviewFrequency: dto.reviewFrequency,
      dueWithinDays: dto.dueWithinDays ?? 14,
      auditLog: [{ action: 'Module Created', actor, at: new Date() }],
    });
    this.validateLiveReadiness(module);
    await module.save();
    return module;
  }

  async update(id: string, dto: UpdateTrainingModuleDto, actor: string): Promise<TrainingModule> {
    const module = await this.findOne(id);
    const changed: string[] = [];
    if (dto.name !== undefined && dto.name !== module.name) {
      changed.push(`Name: "${dto.name}"`);
      module.name = dto.name;
    }
    if (dto.description !== undefined && dto.description !== module.description) {
      module.description = dto.description;
      changed.push('Description updated');
    }
    if (dto.status !== undefined && dto.status !== module.status) {
      changed.push(`Status: ${dto.status}`);
      module.status = dto.status as TrainingModule['status'];
    }
    if (dto.contentBlocks !== undefined) {
      module.contentBlocks = dto.contentBlocks as TrainingModule['contentBlocks'];
      changed.push('Content updated');
    }
    if (dto.questionBank !== undefined) {
      module.questionBank = dto.questionBank as TrainingModule['questionBank'];
      changed.push('Question bank updated');
    }
    if (dto.passMarkPercent !== undefined && dto.passMarkPercent !== module.passMarkPercent) {
      changed.push(`Pass mark: ${dto.passMarkPercent}%`);
      module.passMarkPercent = dto.passMarkPercent;
    }
    if (dto.questionsPerAttempt !== undefined && dto.questionsPerAttempt !== module.questionsPerAttempt) {
      changed.push(`Questions per attempt: ${dto.questionsPerAttempt}`);
      module.questionsPerAttempt = dto.questionsPerAttempt;
    }
    if (dto.reviewFrequency !== undefined && dto.reviewFrequency !== module.reviewFrequency) {
      changed.push(`Review frequency: ${dto.reviewFrequency}`);
      module.reviewFrequency = dto.reviewFrequency as TrainingModule['reviewFrequency'];
    }
    if (dto.dueWithinDays !== undefined && dto.dueWithinDays !== module.dueWithinDays) {
      changed.push(`Due within: ${dto.dueWithinDays} days`);
      module.dueWithinDays = dto.dueWithinDays;
    }
    this.validateLiveReadiness(module);
    if (changed.length > 0) {
      module.auditLog.push({ action: 'Module Updated', changes: changed.join(', '), actor, at: new Date() });
      await module.save();
    }
    return module;
  }

  async remove(id: string): Promise<void> {
    const result = await this.moduleModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Training module ${id} not found`);
    }
    await this.attemptModel.deleteMany({ module: id }).exec();
  }

  // Same merge-not-overwrite logic as PoliciesService.assignUsers: staff kept
  // on the list keep their existing assignment row (score/compliance history
  // untouched); newly-selected staff get a fresh row; deselected staff are
  // dropped entirely.
  async assignUsers(id: string, dto: AssignTrainingUsersDto, actor: string): Promise<TrainingModule> {
    const module = await this.findOne(id);
    const staffList = await this.staffModel.find({ _id: { $in: dto.staffIds } }).select('name').exec();
    const existingByStaffId = new Map(module.assignments.map((a) => [String(a.staff), a]));
    const added: string[] = [];
    const kept: TrainingAssignment[] = [];
    for (const staff of staffList) {
      const staffId = String(staff._id);
      const existing = existingByStaffId.get(staffId);
      if (existing) {
        kept.push(existing);
      } else {
        kept.push({
          staff: staff._id,
          staffName: staff.name,
          assignedAt: new Date(),
          dueDate: addDays(module.dueWithinDays),
          reviewDueNotified: false,
        } as TrainingAssignment);
        added.push(staff.name);
      }
    }
    const keptIds = new Set(staffList.map((s) => String(s._id)));
    const removed = module.assignments.filter((a) => !keptIds.has(String(a.staff))).map((a) => a.staffName);
    module.assignments = kept;
    if (added.length > 0 || removed.length > 0) {
      const changes = [added.length > 0 ? `Assigned ${added.join(', ')}` : null, removed.length > 0 ? `Unassigned ${removed.join(', ')}` : null]
        .filter(Boolean)
        .join('; ');
      module.auditLog.push({ action: 'Assignments Changed', changes, actor, at: new Date() });
    }
    await module.save();
    return module;
  }

  // Turning on adds a fresh row for every active staff member not already
  // assigned; turning off only stops future staff being auto-included --
  // existing rows (and their history) are left alone, same non-destructive
  // spirit as assignUsers().
  async setAssignAllStaff(id: string, enabled: boolean, actor: string): Promise<TrainingModule> {
    const module = await this.findOne(id);
    module.assignAllStaff = enabled;
    if (enabled) {
      const existingIds = new Set(module.assignments.map((a) => String(a.staff)));
      const activeStaff = await this.staffModel.find({ locked: { $ne: true } }).select('name').exec();
      const toAdd = activeStaff.filter((s) => !existingIds.has(String(s._id)));
      for (const staff of toAdd) {
        module.assignments.push({
          staff: staff._id,
          staffName: staff.name,
          assignedAt: new Date(),
          dueDate: addDays(module.dueWithinDays),
          reviewDueNotified: false,
        } as TrainingAssignment);
      }
    }
    module.auditLog.push({
      action: 'Assignments Changed',
      changes: enabled ? 'Assigned to all staff' : 'Stopped auto-assigning to all staff',
      actor,
      at: new Date(),
    });
    await module.save();
    return module;
  }

  async getCompliance(): Promise<
    Array<{
      moduleId: string;
      moduleName: string;
      staffId: string;
      staffName: string;
      lastScorePercent?: number;
      lastPassed?: boolean;
      lastCompletedAt?: string;
      dueDate: string;
      nextDueDate?: string;
      status: ComplianceStatus;
    }>
  > {
    const modules = await this.moduleModel.find().select('name assignments').exec();
    const rows: Array<{
      moduleId: string;
      moduleName: string;
      staffId: string;
      staffName: string;
      lastScorePercent?: number;
      lastPassed?: boolean;
      lastCompletedAt?: string;
      dueDate: string;
      nextDueDate?: string;
      status: ComplianceStatus;
    }> = [];
    for (const module of modules) {
      for (const a of module.assignments) {
        rows.push({
          moduleId: String(module._id),
          moduleName: module.name,
          staffId: String(a.staff),
          staffName: a.staffName,
          lastScorePercent: a.lastScorePercent,
          lastPassed: a.lastPassed,
          lastCompletedAt: a.lastCompletedAt,
          dueDate: a.dueDate,
          nextDueDate: a.nextDueDate,
          status: computeComplianceStatus(a),
        });
      }
    }
    return rows;
  }

  getAttemptHistory(moduleId: string, staffId?: string): Promise<TrainingAttempt[]> {
    return this.attemptModel
      .find({ module: moduleId, ...(staffId ? { staff: staffId } : {}) })
      .sort({ startedAt: -1 })
      .exec();
  }

  async getContentFile(moduleId: string, blockId: string): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const module = await this.findOne(moduleId);
    const block = module.contentBlocks.find((b) => String((b as { _id?: unknown })._id) === blockId);
    const match = block?.pdfFile?.match(/^data:([^;]+);base64,(.+)$/s);
    if (!block || !match) {
      throw new NotFoundException('No file found for this content block.');
    }
    const [, contentType, base64] = match;
    return { buffer: Buffer.from(base64, 'base64'), contentType, fileName: block.pdfFileName || 'document.pdf' };
  }

  @Cron(CronExpression.EVERY_HOUR)
  private async reconcileAndNotify(): Promise<void> {
    const liveModules = await this.moduleModel.find({ status: 'live' }).exec();
    for (const module of liveModules) {
      let dirty = false;

      if (module.assignAllStaff) {
        const existingIds = new Set(module.assignments.map((a) => String(a.staff)));
        const activeStaff = await this.staffModel.find({ locked: { $ne: true } }).select('name').exec();
        const toAdd = activeStaff.filter((s) => !existingIds.has(String(s._id)));
        for (const staff of toAdd) {
          module.assignments.push({
            staff: staff._id,
            staffName: staff.name,
            assignedAt: new Date(),
            dueDate: addDays(module.dueWithinDays),
            reviewDueNotified: false,
          } as TrainingAssignment);
          dirty = true;
        }
      }

      const overdue = module.assignments.filter((a) => computeComplianceStatus(a) === 'overdue' && !a.reviewDueNotified);
      if (overdue.length > 0) {
        await this.notificationService.dispatch(
          'Training review due',
          `${overdue.length} staff member${overdue.length === 1 ? '' : 's'} ${overdue.length === 1 ? 'has' : 'have'} training due for "${module.name}".`,
          'trainingReviewDue',
        );
        for (const a of overdue) a.reviewDueNotified = true;
        dirty = true;
      }

      if (dirty) await module.save();
    }
  }
}
