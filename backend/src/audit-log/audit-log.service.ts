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
  // Returns the created entry (mainly so callers that need its _id -- e.g.
  // to embed a tracking-pixel URL pointing back at it -- can get it) or
  // undefined if creation failed.
  async record(
    customerId: string | Types.ObjectId,
    type: AuditEventType,
    title: string,
    description?: string,
    amount?: number,
    actor = 'System',
    attachment?: { data: string; name: string },
    readTitle?: string,
    invoiceId?: string | Types.ObjectId,
  ): Promise<AuditLogEntry | undefined> {
    try {
      return await this.auditLogModel.create({
        customer: customerId,
        type,
        title,
        description,
        amount,
        actor,
        attachmentData: attachment?.data,
        attachmentName: attachment?.name,
        readTitle,
        invoice: invoiceId,
      });
    } catch {
      // never let audit logging break the primary action it's describing
      return undefined;
    }
  }

  /**
   * Called by GET /audit-log/:id/pixel.gif when a sent email's tracking
   * pixel loads. First-open only (guarded by the openedAt filter, same
   * pattern as InvoicesService/QuotesService's own markOpened) -- a second
   * open of the same email doesn't spam another Activity entry. Silently
   * does nothing for an entry with no readTitle (nothing embeds a pixel
   * pointing at those) or one that's already been opened.
   */
  async markOpened(entryId: string): Promise<void> {
    try {
      const entry = await this.auditLogModel
        .findOneAndUpdate(
          { _id: entryId, openedAt: { $exists: false } },
          { openedAt: new Date() },
        )
        .exec();
      if (!entry || !entry.readTitle) return;
      await this.record(entry.customer, AuditEventType.EMAIL_READ, entry.readTitle, undefined, undefined, 'Customer');
    } catch {
      // never let pixel tracking break anything
    }
  }

  /** Attaches a file to an already-existing entry (e.g. a PDF snapshot arriving after the "sent" entry that embedded its tracking pixel was already created). */
  async attachFile(entryId: string, data: string, name: string): Promise<void> {
    try {
      await this.auditLogModel
        .updateOne({ _id: entryId }, { attachmentData: data, attachmentName: name })
        .exec();
    } catch {
      // best-effort, same as record() above
    }
  }

  findForCustomer(customerId: string): Promise<AuditLogEntry[]> {
    return this.auditLogModel
      .find({ customer: customerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  findForInvoice(invoiceId: string): Promise<AuditLogEntry[]> {
    return this.auditLogModel
      .find({ invoice: invoiceId })
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
