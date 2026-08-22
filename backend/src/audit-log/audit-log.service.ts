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
  ): Promise<void> {
    try {
      await this.auditLogModel.create({
        customer: customerId,
        type,
        title,
        description,
        amount,
        actor,
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

  async incomeByMonth(
    customerId: string,
    months: number,
  ): Promise<IncomeMonth[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const rows = await this.auditLogModel.aggregate<{
      _id: string;
      total: number;
    }>([
      {
        $match: {
          customer: new Types.ObjectId(customerId),
          type: AuditEventType.PAYMENT_RECEIVED,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const byMonth = new Map(rows.map((r) => [r._id, r.total]));
    const result: IncomeMonth[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      result.push({ month: key, total: byMonth.get(key) ?? 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }
}
