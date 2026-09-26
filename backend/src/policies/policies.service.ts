import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { NotificationService } from '../notifications/notification.service';
import { Staff } from '../staff/schemas/staff.schema';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { PublishVersionDto } from './dto/publish-version.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import {
  Policy,
  PolicySignOff,
  PolicyStatus,
  PolicyVersion,
  ReviewFrequency,
} from './schemas/policy.schema';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Same interval math as RiskAssessmentsService.addReviewInterval() -- kept as
// its own copy for the same "otherwise unrelated modules" reasoning as the
// duplicated REVIEW_FREQUENCIES constant.
function addReviewInterval(frequency: ReviewFrequency | undefined): string {
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

@Injectable()
export class PoliciesService {
  constructor(
    @InjectModel(Policy.name) private readonly policyModel: Model<Policy>,
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
    private readonly notificationService: NotificationService,
  ) {}

  findAll(): Promise<Policy[]> {
    return this.policyModel.find().sort({ name: 1 }).exec();
  }

  async findOne(id: string): Promise<Policy> {
    const policy = await this.policyModel.findById(id).exec();
    if (!policy) {
      throw new NotFoundException(`Policy ${id} not found`);
    }
    return policy;
  }

  private activeStaff(): Promise<{ _id: unknown; name: string }[]> {
    return this.staffModel.find({ locked: { $ne: true } }).select('name').exec();
  }

  // Ungated (see PoliciesController) -- just names, for the sign-off picker
  // shown when creating a policy or publishing a new version. Any staff
  // member can pick who else needs to sign, not just those with
  // staff.manage.
  listStaffOptions(): Promise<{ _id: unknown; name: string }[]> {
    return this.activeStaff();
  }

  private async resolveSignOffStaff(staffIds?: string[]): Promise<{ _id: unknown; name: string }[]> {
    if (!staffIds?.length) return this.activeStaff();
    return this.staffModel.find({ _id: { $in: staffIds } }).select('name').exec();
  }

  // A fresh, all-unsigned set of PolicySignOff rows for a version about to be
  // published -- nobody is pre-signed, including whoever is publishing it:
  // they must sign off through the same explicit action as everyone else, so
  // it shows in the audit log like any other sign-off.
  private buildSignOffs(staffList: { _id: unknown; name: string }[]): PolicySignOff[] {
    return staffList.map((s) => ({ staff: s._id, staffName: s.name }) as PolicySignOff);
  }

  async create(dto: CreatePolicyDto, actor: string): Promise<Policy> {
    const staffList = await this.resolveSignOffStaff(dto.signOffStaffIds);
    const now = new Date();
    const status = (dto.status ?? 'draft') as PolicyStatus;
    const version: PolicyVersion = {
      version: 1,
      content: dto.content,
      changeSummary: dto.changeSummary,
      publishedAt: now,
      publishedBy: actor,
      signOffs: this.buildSignOffs(staffList),
    } as PolicyVersion;
    const policy = new this.policyModel({
      name: dto.name,
      category: dto.category,
      reviewFrequency: dto.reviewFrequency,
      status,
      nextReviewDate:
        status === 'published' && dto.reviewFrequency
          ? addReviewInterval(dto.reviewFrequency as ReviewFrequency)
          : undefined,
      versions: [version],
      auditLog: [{ action: 'Policy Created', actor, at: now }],
    });
    await policy.save();
    return policy;
  }

  async update(id: string, dto: UpdatePolicyDto, actor: string): Promise<Policy> {
    const policy = await this.findOne(id);
    const wasPublished = policy.status === 'published';
    const changed: string[] = [];
    if (dto.name !== undefined && dto.name !== policy.name) {
      changed.push(`Name: "${dto.name}"`);
      policy.name = dto.name;
    }
    if (dto.category !== undefined && dto.category !== policy.category) {
      changed.push(`Category: "${dto.category}"`);
      policy.category = dto.category;
    }
    if (dto.reviewFrequency !== undefined && dto.reviewFrequency !== policy.reviewFrequency) {
      changed.push(`Review Frequency: ${dto.reviewFrequency}`);
      policy.reviewFrequency = dto.reviewFrequency as ReviewFrequency;
    }
    if (dto.status !== undefined && dto.status !== policy.status) {
      changed.push(`Status: ${dto.status}`);
      policy.status = dto.status as PolicyStatus;
    }
    // Publishing for the first time schedules the first review from today,
    // same "going live" convention as RiskAssessmentsService.update().
    if (policy.status === 'published' && !wasPublished && policy.reviewFrequency) {
      policy.nextReviewDate = addReviewInterval(policy.reviewFrequency);
      policy.reviewDueNotified = false;
      changed.push(`Next review date set to ${policy.nextReviewDate}`);
    }
    if (changed.length > 0) {
      policy.auditLog.push({ action: 'Policy Updated', changes: changed.join(', '), actor, at: new Date() });
      await policy.save();
    }
    return policy;
  }

  async remove(id: string): Promise<void> {
    const result = await this.policyModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Policy ${id} not found`);
    }
  }

  // Appends a new, immutable version -- never edits an existing one -- and
  // re-snapshots sign-offs for the current active staff list, so an old
  // signature never silently carries forward onto changed content.
  async publishVersion(id: string, dto: PublishVersionDto, actor: string): Promise<Policy> {
    const policy = await this.findOne(id);
    const staffList = await this.resolveSignOffStaff(dto.signOffStaffIds);
    const now = new Date();
    const nextVersionNumber = (policy.versions[policy.versions.length - 1]?.version ?? 0) + 1;
    policy.versions.push({
      version: nextVersionNumber,
      content: dto.content,
      changeSummary: dto.changeSummary,
      publishedAt: now,
      publishedBy: actor,
      signOffs: this.buildSignOffs(staffList),
    } as PolicyVersion);
    if (policy.reviewFrequency) {
      policy.nextReviewDate = addReviewInterval(policy.reviewFrequency);
    }
    policy.reviewDueNotified = false;
    policy.auditLog.push({
      action: 'New Version Published',
      changes: `v${nextVersionNumber}${dto.changeSummary ? `: ${dto.changeSummary}` : ''}`,
      actor,
      at: now,
    });
    await policy.save();
    return policy;
  }

  // Self-service -- a staff member signs off the current version for
  // themselves (there's no "sign on someone else's behalf").
  async signOff(id: string, actorId: string, actor: string): Promise<Policy> {
    const policy = await this.findOne(id);
    const current = policy.versions[policy.versions.length - 1];
    if (!current) {
      throw new BadRequestException('This policy has no published version yet.');
    }
    const row = current.signOffs.find((s) => String(s.staff) === actorId);
    if (!row) {
      throw new NotFoundException('You are not listed as a required sign-off for this policy.');
    }
    if (!row.signedAt) {
      row.signedAt = new Date();
      policy.auditLog.push({
        action: 'Signed Off',
        changes: `${actor} signed v${current.version}`,
        actor,
        at: new Date(),
      });
      await policy.save();
    }
    return policy;
  }

  // Broadcasts one reminder to all staff (admin feed + push) -- there's no
  // per-staff-targeted push channel today (PushService only has
  // sendToAll()/sendToCustomer()), so this can't ping just the outstanding
  // people individually.
  async sendReminder(id: string, actor: string): Promise<Policy> {
    const policy = await this.findOne(id);
    const current = policy.versions[policy.versions.length - 1];
    if (!current) {
      throw new BadRequestException('This policy has no published version yet.');
    }
    const outstanding = current.signOffs.filter((s) => !s.signedAt);
    if (outstanding.length === 0) {
      throw new BadRequestException('Everyone has already signed off this version.');
    }
    const now = new Date();
    for (const row of outstanding) row.reminderSentAt = now;
    policy.auditLog.push({
      action: 'Reminder Sent',
      changes: `${outstanding.length} outstanding sign-off${outstanding.length === 1 ? '' : 's'}`,
      actor,
      at: now,
    });
    await policy.save();
    await this.notificationService.dispatch(
      'Policy sign-off reminder',
      `${outstanding.length} staff member${outstanding.length === 1 ? '' : 's'} still need${
        outstanding.length === 1 ? 's' : ''
      } to sign off "${policy.name}" v${current.version}.`,
      'policySignOffReminder',
    );
    return policy;
  }

  @Cron(CronExpression.EVERY_HOUR)
  private async notifyDueReviews(): Promise<void> {
    const due = await this.policyModel
      .find({ status: 'published', nextReviewDate: { $lte: today() }, reviewDueNotified: { $ne: true } })
      .exec();
    for (const policy of due) {
      await this.notificationService.dispatch(
        'Policy review due',
        `"${policy.name}" is due for review.`,
        'policyReviewDue',
      );
      policy.reviewDueNotified = true;
      await policy.save();
    }
  }
}
