import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AuditEventType,
  AuditLogEntry,
} from './schemas/audit-log-entry.schema';

export interface IncomeMonth {
  month: string; // 'YYYY-MM'
  total: number;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLogEntry.name)
    private readonly auditLogModel: Model<AuditLogEntry>,
  ) {}

  // Fire-and-forget from the caller's perspective -- logging a failure never
  // fails the underlying action, so callers don't need to try/catch this.
  async record(
    customerId: string | Types.ObjectId,
    type: AuditEventType,
    title: string,
    description?: string,
    amount?: number,
    actor = 'System',
    attachment?: { data: string; name: string },
  ): Promise<void> {
    try {
      await this.auditLogModel.create({
        customer: customerId,
        type,
        title,
        description,
        amount,
        actor,
        attachmentData: attachment?.data,
        attachmentName: attachment?.name,
      });
    } catch {
      // never let audit logging break the primary action it's describing
    }
  }

  findForCustomer(customerId: string): Promise<AuditLogEntry[]> {
    return this.auditLogModel
      .find({ customer: customerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Nets PAYMENT_RECEIVED against PAYMENT_REMOVED per month, rather than just
  // summing PAYMENT_RECEIVED, so a payment recorded in error and then deleted
  // (there's no payment edit -- deleting and re-recording is the intended
  // correction path) doesn't keep counting toward income forever. Both event
  // types carry the same `amount`; crediting a removal to its own month
  // rather than tracing back to the original receipt's month is a
  // simplification that holds as long as corrections happen reasonably soon
  // after the mistake, which is the common case.
  async incomeByMonth(
    customerId: string,
    months: number,
  ): Promise<IncomeMonth[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const groupByMonth = (type: AuditEventType) => [
      {
        $match: {
          customer: new Types.ObjectId(customerId),
          type,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          total: { $sum: '$amount' },
        },
      },
    ];

    const [receivedRows, removedRows] = await Promise.all([
      this.auditLogModel.aggregate<{ _id: string; total: number }>(
        groupByMonth(AuditEventType.PAYMENT_RECEIVED),
      ),
      this.auditLogModel.aggregate<{ _id: string; total: number }>(
        groupByMonth(AuditEventType.PAYMENT_REMOVED),
      ),
    ]);

    const receivedByMonth = new Map(receivedRows.map((r) => [r._id, r.total]));
    const removedByMonth = new Map(removedRows.map((r) => [r._id, r.total]));
    const result: IncomeMonth[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const total =
        (receivedByMonth.get(key) ?? 0) - (removedByMonth.get(key) ?? 0);
      result.push({ month: key, total });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }
}
