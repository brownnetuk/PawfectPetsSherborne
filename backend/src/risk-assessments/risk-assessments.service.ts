import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { nextSequenceNumber } from '../common/document-number.util';
import { escapeHtml } from '../common/html.util';
import { NotificationService } from '../notifications/notification.service';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateRiskAssessmentDto } from './dto/create-risk-assessment.dto';
import { CreateRiskItemDto } from './dto/create-risk-item.dto';
import { UpdateRiskAssessmentDto } from './dto/update-risk-assessment.dto';
import { UpdateRiskItemDto } from './dto/update-risk-item.dto';
import {
  ReviewFrequency,
  RiskAssessment,
  RiskItem,
} from './schemas/risk-assessment.schema';

const REVIEW_PERIOD_LABELS: Record<ReviewFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  '6-monthly': '6-Monthly',
  annually: 'Annually',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Advances a 'YYYY-MM-DD' date by one review interval, from today -- used by
// reviewPolicy() to compute the next due date each time a review is logged.
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

// Matches the "Changes Made" column format shown in the Audit Log modal, e.g.
// `Hazard: "...", Who: "...", Likelihood: 2, Severity: 4, Residual Risk: low, Review: Monthly`.
function describeRiskItem(item: {
  hazard: string;
  whoAtRisk?: string;
  likelihood: number;
  severity: number;
  residualRisk: string;
  reviewPeriod?: ReviewFrequency;
}): string {
  const reviewLabel = item.reviewPeriod ? REVIEW_PERIOD_LABELS[item.reviewPeriod] : 'Not set';
  return (
    `Hazard: "${item.hazard}", Who: "${item.whoAtRisk ?? ''}", Likelihood: ${item.likelihood}, ` +
    `Severity: ${item.severity}, Residual Risk: ${item.residualRisk}, Review: ${reviewLabel}`
  );
}

@Injectable()
export class RiskAssessmentsService {
  constructor(
    @InjectModel(RiskAssessment.name) private readonly riskAssessmentModel: Model<RiskAssessment>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly notificationService: NotificationService,
    private readonly settingsService: SettingsService,
  ) {}

  findAll(): Promise<RiskAssessment[]> {
    return this.riskAssessmentModel.find().sort({ createdAt: 1 }).exec();
  }

  async findOne(id: string): Promise<RiskAssessment> {
    const assessment = await this.riskAssessmentModel.findById(id).exec();
    if (!assessment) {
      throw new NotFoundException(`Risk assessment ${id} not found`);
    }
    return assessment;
  }

  async create(dto: CreateRiskAssessmentDto, actor: string): Promise<RiskAssessment> {
    const seq = await nextSequenceNumber(this.businessInfoModel, 'riskAssessmentNextNumber');
    const created = await new this.riskAssessmentModel({
      raId: `RA${seq}`,
      assessmentDate: today(),
      name: dto.name,
      regulationReference: dto.regulationReference,
      reviewFrequency: dto.reviewFrequency,
      scope: dto.scope,
      status: dto.status ?? 'draft',
      auditLog: [{ action: 'Assessment Created', actor, at: new Date() }],
    }).save();
    return created;
  }

  async update(id: string, dto: UpdateRiskAssessmentDto, actor: string): Promise<RiskAssessment> {
    const assessment = await this.findOne(id);
    const wasLive = assessment.status === 'live';
    const changed: string[] = [];
    if (dto.name !== undefined && dto.name !== assessment.name) {
      changed.push(`Name: "${dto.name}"`);
      assessment.name = dto.name;
    }
    if (dto.regulationReference !== undefined && dto.regulationReference !== assessment.regulationReference) {
      changed.push(`Regulation Reference: "${dto.regulationReference}"`);
      assessment.regulationReference = dto.regulationReference;
    }
    if (dto.reviewFrequency !== undefined && dto.reviewFrequency !== assessment.reviewFrequency) {
      changed.push(`Review Frequency: ${REVIEW_PERIOD_LABELS[dto.reviewFrequency as ReviewFrequency]}`);
      assessment.reviewFrequency = dto.reviewFrequency as ReviewFrequency;
    }
    if (dto.scope !== undefined && dto.scope !== assessment.scope) {
      changed.push(`Scope: "${dto.scope}"`);
      assessment.scope = dto.scope;
    }
    if (dto.status !== undefined && dto.status !== assessment.status) {
      changed.push(`Status: ${dto.status}`);
      assessment.status = dto.status as RiskAssessment['status'];
    }
    // Going live for the first time (or after being taken off live) schedules
    // its first review from today, using whatever review frequency is set --
    // otherwise "Next Review Date" would sit at "—" until someone happened to
    // use "Review Policy" separately.
    if (assessment.status === 'live' && !wasLive && assessment.reviewFrequency) {
      assessment.nextReviewDate = addReviewInterval(assessment.reviewFrequency);
      assessment.reviewDueNotified = false;
      changed.push(`Next review date set to ${assessment.nextReviewDate}`);
    }
    if (changed.length > 0) {
      assessment.auditLog.push({
        action: 'Assessment Updated',
        changes: changed.join(', '),
        actor,
        at: new Date(),
      });
      await assessment.save();
    }
    return assessment;
  }

  async remove(id: string): Promise<void> {
    const result = await this.riskAssessmentModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Risk assessment ${id} not found`);
    }
  }

  async reviewPolicy(id: string, actor: string): Promise<RiskAssessment> {
    const assessment = await this.findOne(id);
    assessment.nextReviewDate = addReviewInterval(assessment.reviewFrequency);
    assessment.reviewDueNotified = false;
    assessment.auditLog.push({
      action: 'Policy Reviewed',
      changes: `Signed off by ${actor} -- next review date set to ${assessment.nextReviewDate}`,
      actor,
      at: new Date(),
    });
    await assessment.save();
    return assessment;
  }

  // Notifies staff (admin feed + push) the first time a live assessment's
  // next review date arrives -- reviewDueNotified stops this re-firing every
  // hour once overdue, and is cleared again by reviewPolicy()/update() (going
  // live) whenever nextReviewDate next moves forward.
  @Cron(CronExpression.EVERY_HOUR)
  private async notifyDueReviews(): Promise<void> {
    const due = await this.riskAssessmentModel
      .find({ status: 'live', nextReviewDate: { $lte: today() }, reviewDueNotified: { $ne: true } })
      .exec();
    for (const assessment of due) {
      await this.notificationService.dispatch(
        'Risk assessment review due',
        `${assessment.name} (${assessment.raId}) is due for review.`,
        'riskAssessmentReviewDue',
      );
      assessment.reviewDueNotified = true;
      await assessment.save();
    }
  }

  async addRisk(id: string, dto: CreateRiskItemDto, actor: string): Promise<RiskAssessment> {
    const assessment = await this.findOne(id);
    const item = {
      hazard: dto.hazard,
      whoAtRisk: dto.whoAtRisk,
      existingControls: dto.existingControls ?? [],
      furtherActions: dto.furtherActions ?? [],
      likelihood: dto.likelihood,
      severity: dto.severity,
      residualRisk: dto.residualRisk,
      reviewPeriod: dto.reviewPeriod,
    } as RiskItem;
    assessment.risks.push(item);
    assessment.auditLog.push({
      action: 'Risk Item Added',
      changes: describeRiskItem(dto as unknown as Parameters<typeof describeRiskItem>[0]),
      actor,
      at: new Date(),
    });
    await assessment.save();
    return assessment;
  }

  async updateRisk(
    id: string,
    riskId: string,
    dto: UpdateRiskItemDto,
    actor: string,
  ): Promise<RiskAssessment> {
    const assessment = await this.findOne(id);
    const item = assessment.risks.find((r) => (r as { _id: { toString(): string } })._id.toString() === riskId);
    if (!item) {
      throw new NotFoundException(`Risk item ${riskId} not found`);
    }
    if (dto.hazard !== undefined) item.hazard = dto.hazard;
    if (dto.whoAtRisk !== undefined) item.whoAtRisk = dto.whoAtRisk;
    if (dto.existingControls !== undefined) item.existingControls = dto.existingControls;
    if (dto.furtherActions !== undefined) item.furtherActions = dto.furtherActions;
    if (dto.likelihood !== undefined) item.likelihood = dto.likelihood;
    if (dto.severity !== undefined) item.severity = dto.severity;
    if (dto.residualRisk !== undefined) item.residualRisk = dto.residualRisk as RiskItem['residualRisk'];
    if (dto.reviewPeriod !== undefined) item.reviewPeriod = dto.reviewPeriod as ReviewFrequency;
    assessment.auditLog.push({
      action: 'Risk Item Updated',
      changes: describeRiskItem(item),
      actor,
      at: new Date(),
    });
    await assessment.save();
    return assessment;
  }

  async removeRisk(id: string, riskId: string, actor: string): Promise<RiskAssessment> {
    const assessment = await this.findOne(id);
    const item = assessment.risks.find((r) => (r as { _id: { toString(): string } })._id.toString() === riskId);
    if (!item) {
      throw new NotFoundException(`Risk item ${riskId} not found`);
    }
    assessment.risks = assessment.risks.filter(
      (r) => (r as { _id: { toString(): string } })._id.toString() !== riskId,
    );
    assessment.auditLog.push({
      action: 'Risk Item Removed',
      changes: `Hazard: "${item.hazard}"`,
      actor,
      at: new Date(),
    });
    await assessment.save();
    return assessment;
  }

  // "Send by Email" (Risk Assessments list Actions menu) -- unlike a Policy,
  // a risk assessment has no single content blob to email, so the body is
  // built here from the header fields plus a table of its risks, escaping
  // every user-entered string (none of it is pre-formatted HTML the way
  // policy content is). Wrapped in the same GENERIC campaign template every
  // other one-off broadcast uses (EmailMessagesService.send(),
  // PoliciesService.sendPolicyEmail()), so it's branded consistently without
  // needing its own dedicated template to configure.
  async sendRiskAssessmentEmail(id: string, email: string, actor: string): Promise<RiskAssessment> {
    const assessment = await this.findOne(id);
    const meta = [
      assessment.regulationReference,
      assessment.reviewFrequency ? REVIEW_PERIOD_LABELS[assessment.reviewFrequency] : undefined,
      assessment.nextReviewDate ? `Next review ${assessment.nextReviewDate}` : undefined,
    ]
      .filter(Boolean)
      .map((s) => escapeHtml(s as string))
      .join(' &middot; ');
    const scopeHtml = assessment.scope
      ? `<p>${escapeHtml(assessment.scope)}</p>`
      : '';
    const cell = 'padding:6px 10px;border:1px solid #e3e8de;text-align:left;vertical-align:top;';
    const listHtml = (items: string[]) =>
      items.length ? `<ul style="margin:0;padding-left:16px;">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '—';
    const rows = assessment.risks
      .map(
        (r) => `<tr>
          <td style="${cell}">${escapeHtml(r.hazard)}</td>
          <td style="${cell}">${r.whoAtRisk ? escapeHtml(r.whoAtRisk) : '—'}</td>
          <td style="${cell}">${listHtml(r.existingControls)}</td>
          <td style="${cell}">${listHtml(r.furtherActions)}</td>
          <td style="${cell}text-align:center;">${r.likelihood}</td>
          <td style="${cell}text-align:center;">${r.severity}</td>
          <td style="${cell}text-align:center;">${r.likelihood * r.severity}</td>
          <td style="${cell}text-transform:capitalize;">${escapeHtml(r.residualRisk)}</td>
        </tr>`,
      )
      .join('');
    const head = 'padding:6px 10px;border:1px solid #e3e8de;text-align:left;background:#f4f6f1;';
    const tableHtml = assessment.risks.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
          <thead><tr>
            <th style="${head}">Hazard</th>
            <th style="${head}">Who At Risk</th>
            <th style="${head}">Existing Controls</th>
            <th style="${head}">Further Actions</th>
            <th style="${head}">L</th>
            <th style="${head}">S</th>
            <th style="${head}">Score</th>
            <th style="${head}">Residual Risk</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`
      : '<p>No risks have been recorded yet.</p>';
    const bodyHtml = `<h2 style="margin:0 0 4px;">${escapeHtml(assessment.name)}</h2><div style="color:#6f7d72;font-size:12px;margin-bottom:16px;">${escapeHtml(assessment.raId)}${meta ? ` &middot; ${meta}` : ''}</div>${scopeHtml}${tableHtml}`;
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.GENERIC,
      email,
      { name: 'there', campaignSubject: assessment.name },
      { emailBodyText: bodyHtml },
    );
    assessment.auditLog.push({
      action: 'Emailed',
      changes: `Sent to ${email}`,
      actor,
      at: new Date(),
    });
    await assessment.save();
    return assessment;
  }
}
