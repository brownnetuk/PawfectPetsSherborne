import { Injectable, NotFoundException } from '@nestjs/common';
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

  // Latest "Booking confirmation emailed" entry for a booking reference --
  // lets BoardingBookingsService back-fill confirmationSentAt for bookings
  // emailed before that field existed. The reference only lives in the
  // description ("BK00010 confirmation emailed to ..."), hence the prefix match.
  async findBookingConfirmationSentAt(customerId: string, reference: string): Promise<Date | undefined> {
    if (!Types.ObjectId.isValid(customerId)) return undefined;
    const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entry = await this.auditLogModel
      .findOne({
        customer: new Types.ObjectId(customerId),
        title: 'Booking confirmation emailed',
        description: { $regex: `^${escaped} ` },
      })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean<{ createdAt?: Date }>()
      .exec();
    return entry?.createdAt;
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

  // Every stored registration form PDF (sent-email and intake-completion
  // snapshots alike, both REGISTRATION_EMAIL_SENT) -- just the metadata, not
  // the PDFs themselves, for Settings > Forms "Regenerate registration PDFs"
  // to work through one customer at a time.
  findRegistrationSnapshots(): Promise<AuditLogEntry[]> {
    return this.auditLogModel
      .find({
        type: AuditEventType.REGISTRATION_EMAIL_SENT,
        attachmentData: { $exists: true, $ne: '' },
      })
      .select('customer title createdAt attachmentName regeneratedAt')
      .sort({ createdAt: -1 })
      .exec();
  }

  // Settings > Forms "Delete PDFs for deleted customers" -- registration
  // snapshots whose customer no longer exists (deleting a customer leaves
  // its Activity entries behind), which nothing in the app can show any
  // more. Looked up against the customers collection directly rather than
  // injecting CustomersService, to keep this a leaf module (see
  // AuditLogModule). Returns how many were deleted.
  async deleteOrphanedRegistrationSnapshots(): Promise<{ deleted: number }> {
    const orphans = await this.auditLogModel
      .aggregate<{ _id: Types.ObjectId }>([
        { $match: { type: AuditEventType.REGISTRATION_EMAIL_SENT } },
        {
          $lookup: {
            from: 'customers',
            localField: 'customer',
            foreignField: '_id',
            as: 'owner',
          },
        },
        { $match: { owner: { $size: 0 } } },
        { $project: { _id: 1 } },
      ])
      .exec();
    if (orphans.length === 0) return { deleted: 0 };
    const result = await this.auditLogModel
      .deleteMany({ _id: { $in: orphans.map((o) => o._id) } })
      .exec();
    return { deleted: result.deletedCount };
  }

  // Swaps a registration snapshot's PDF for one the admin app just rebuilt
  // in the current style, keeping the originally stored PDF in
  // originalAttachmentData the first time round (see the schema's comment).
  async replaceRegistrationAttachment(
    entryId: string,
    data: string,
    name: string,
  ): Promise<void> {
    const entry = await this.auditLogModel
      .findOne({
        _id: entryId,
        type: AuditEventType.REGISTRATION_EMAIL_SENT,
        attachmentData: { $exists: true, $ne: '' },
      })
      .select('+originalAttachmentData attachmentData attachmentName')
      .exec();
    if (!entry) {
      throw new NotFoundException(`Registration snapshot ${entryId} not found`);
    }
    const update: Record<string, unknown> = {
      attachmentData: data,
      attachmentName: name,
      regeneratedAt: new Date(),
    };
    if (!entry.originalAttachmentData) {
      update.originalAttachmentData = entry.attachmentData;
      update.originalAttachmentName = entry.attachmentName;
    }
    await this.auditLogModel
      .updateOne({ _id: entryId }, { $set: update })
      .exec();
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
