import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { InvoicesService } from '../invoices/invoices.service';
import {
  RECYCLE_BIN_ENTRIES_COLLECTION,
  RecycleBinEntry,
} from './schemas/recycle-bin-entry.schema';
import {
  RecycleBinItem,
  RecycleBinRelink,
} from './schemas/recycle-bin-item.schema';

interface ItemRow {
  _id: Types.ObjectId;
  collectionName: string;
  modelName: string;
  docId: unknown;
  typeLabel: string;
  label: string;
  relinks?: RecycleBinRelink[];
  doc: Record<string, unknown> & { _id: unknown };
}

export interface RecycleBinListEntry {
  id: string;
  deletedAt: Date;
  deletedBy: string;
  typeLabel: string;
  label: string;
  customerName?: string;
  itemCount: number;
  // Everything else that went with it, e.g. "2 pets, 1 invoice, 3 payments".
  alsoIncludes: string;
}

// A deleted record pointing at one of these, which is neither still there
// nor being restored with it, can't be put back yet -- e.g. a payment whose
// invoice was deleted separately. Restoring it anyway would leave it
// orphaned (and PaymentsService's balance logic would have nothing to
// apply to).
const PARENTS: { field: string; collection: string; what: string }[] = [
  { field: 'customer', collection: 'customers', what: 'customer' },
  { field: 'invoice', collection: 'invoices', what: 'invoice' },
];

@Injectable()
export class RecycleBinService {
  constructor(
    @InjectModel(RecycleBinEntry.name)
    private readonly entryModel: Model<RecycleBinEntry>,
    @InjectModel(RecycleBinItem.name)
    private readonly itemModel: Model<RecycleBinItem>,
    @InjectConnection() private readonly connection: Connection,
    private readonly invoicesService: InvoicesService,
    private readonly bankAccountsService: BankAccountsService,
  ) {}

  async findAll(): Promise<RecycleBinListEntry[]> {
    const groups = await this.itemModel
      .aggregate<{
        _id: Types.ObjectId;
        items: {
          docId: unknown;
          typeLabel: string;
          label: string;
          customerName?: string;
        }[];
        entry: RecycleBinEntry;
      }>([
        { $sort: { order: 1 } },
        {
          $group: {
            _id: '$entry',
            items: {
              $push: {
                docId: '$docId',
                typeLabel: '$typeLabel',
                label: '$label',
                customerName: '$customerName',
              },
            },
          },
        },
        {
          $lookup: {
            from: RECYCLE_BIN_ENTRIES_COLLECTION,
            localField: '_id',
            foreignField: '_id',
            as: 'entry',
          },
        },
        { $unwind: '$entry' },
        { $sort: { 'entry.deletedAt': -1 } },
      ])
      .exec();
    return groups.map(({ _id, items, entry }) => {
      // Listed as the record the delete was aimed at (its id is in the
      // request path), not whatever its cascade happened to delete first.
      const primary =
        items.find((i) => entry.pathIds?.includes(String(i.docId))) ?? items[0];
      const counts = new Map<string, number>();
      for (const item of items) {
        if (item === primary) continue;
        counts.set(item.typeLabel, (counts.get(item.typeLabel) ?? 0) + 1);
      }
      return {
        id: String(_id),
        deletedAt: entry.deletedAt,
        deletedBy: entry.deletedBy,
        typeLabel: primary.typeLabel,
        label: primary.label,
        customerName: primary.customerName,
        itemCount: items.length,
        alsoIncludes: [...counts]
          .map(([type, n]) => `${n} ${type.toLowerCase()}${n === 1 ? '' : 's'}`)
          .join(', '),
      };
    });
  }

  async restore(id: string): Promise<{ restored: number }> {
    const entry = await this.entryModel.findById(id).lean().exec();
    if (!entry)
      throw new NotFoundException('That item is no longer in the Recycle Bin.');
    // Reverse of the order they were deleted in -- a cascade deletes
    // children first, so this puts the customer back before their invoices,
    // and an invoice before its payments.
    const items = (await this.itemModel
      .find({ entry: entry._id })
      .sort({ order: -1 })
      .lean()
      .exec()) as unknown as ItemRow[];
    if (items.length === 0) {
      await this.entryModel.deleteOne({ _id: entry._id }).exec();
      throw new NotFoundException('That item is no longer in the Recycle Bin.');
    }
    const db = this.connection.db!;
    const restoring = new Set(
      items.map((i) => `${i.collectionName}:${String(i.docId)}`),
    );

    for (const item of items) {
      const existing = await db
        .collection(item.collectionName)
        .findOne({ _id: item.docId as never }, { projection: { _id: 1 } });
      if (existing) {
        throw new ConflictException(
          `${item.typeLabel} "${item.label}" already exists, so this can't be restored again.`,
        );
      }
      // Activity-log entries are only ever deleted here by the "orphaned
      // registration PDFs" clean-up, whose customer is gone by definition.
      if (item.modelName === 'AuditLogEntry') continue;
      for (const parent of PARENTS) {
        const ref = item.doc[parent.field];
        if (
          !(ref instanceof Types.ObjectId) ||
          item.collectionName === parent.collection
        )
          continue;
        if (restoring.has(`${parent.collection}:${String(ref)}`)) continue;
        const found = await db
          .collection(parent.collection)
          .findOne({ _id: ref }, { projection: { _id: 1 } });
        if (!found) {
          throw new ConflictException(
            `Can't restore ${item.typeLabel.toLowerCase()} "${item.label}": its ${parent.what} has been deleted too. Restore the ${parent.what} from the Recycle Bin first.`,
          );
        }
      }
    }

    // All-or-nothing: if any record can't go back (e.g. a since-reused
    // invoice number hits a unique index), take back out the ones already
    // put back, leaving everything as it was.
    const inserted: ItemRow[] = [];
    try {
      for (const item of items) {
        await db.collection(item.collectionName).insertOne(item.doc as never);
        inserted.push(item);
      }
    } catch (err) {
      for (const item of inserted) {
        await db
          .collection(item.collectionName)
          .deleteOne({ _id: item.docId as never });
      }
      const failed = items[inserted.length];
      throw new ConflictException(
        `Couldn't restore ${failed.typeLabel.toLowerCase()} "${failed.label}": ${(err as Error).message}`,
      );
    }

    for (const item of items) {
      await this.reapply(item);
    }

    await this.itemModel.deleteMany({ entry: entry._id }).exec();
    await this.entryModel.deleteOne({ _id: entry._id }).exec();
    return { restored: items.length };
  }

  // Redoes the knock-on effects each service's remove() undid when the
  // record was deleted (account balances, an invoice's amount paid, links
  // from other records), so a restored record is exactly as if it had never
  // been deleted. Mirrors the remove() of the service named in each case.
  private async reapply(item: ItemRow): Promise<void> {
    const doc = item.doc;
    const amount = typeof doc.amount === 'number' ? doc.amount : 0;
    const id = (v: unknown) => (v instanceof Types.ObjectId ? v : null);
    switch (item.modelName) {
      case 'Payment': {
        // PaymentsService.remove()
        const invoice = id(doc.invoice);
        if (invoice)
          await this.invoicesService.applyPayment(String(invoice), amount, {
            notify: false,
          });
        const account = id(doc.account);
        if (account)
          await this.bankAccountsService.adjustBalance(account, amount);
        break;
      }
      case 'CreditNote': {
        // CreditNotesService.remove()
        const invoice = id(doc.invoice);
        if (invoice)
          await this.invoicesService.reversePayment(String(invoice), amount);
        const account = id(doc.account);
        if (account)
          await this.bankAccountsService.adjustBalance(account, -amount);
        break;
      }
      case 'Expense': {
        // ExpensesService.remove()
        const account = id(doc.account);
        if (account)
          await this.bankAccountsService.adjustBalance(account, -amount);
        break;
      }
      case 'OtherIncome': {
        // OtherIncomeService.remove()
        const account = id(doc.account);
        if (account)
          await this.bankAccountsService.adjustBalance(account, amount);
        break;
      }
      case 'BankTransfer': {
        // BankTransfersService.remove()
        const from = id(doc.fromAccount);
        const to = id(doc.toAccount);
        if (from) await this.bankAccountsService.adjustBalance(from, -amount);
        if (to) await this.bankAccountsService.adjustBalance(to, amount);
        break;
      }
      case 'Animal': {
        // AnimalsService.remove() clears the copy's pointer back -- put it
        // back, as long as that copy hasn't since been linked elsewhere.
        const linked = id(doc.linkedAnimal);
        if (linked) {
          await this.connection
            .db!.collection(item.collectionName)
            .updateOne(
              { _id: linked, linkedAnimal: { $exists: false } },
              { $set: { linkedAnimal: doc._id } },
            );
        }
        break;
      }
    }
    // Arrays it was $pull-ed from on delete, e.g. a boarding booking's
    // incidentReports (BookingIncidentReportsService.remove()).
    for (const link of item.relinks ?? []) {
      await this.connection
        .db!.collection(link.collection)
        .updateOne({ _id: link.id }, { $addToSet: { [link.field]: doc._id } });
    }
  }

  async purge(id: string): Promise<void> {
    const entry = await this.entryModel.findById(id).exec();
    if (!entry)
      throw new NotFoundException('That item is no longer in the Recycle Bin.');
    await this.itemModel.deleteMany({ entry: entry._id }).exec();
    await this.entryModel.deleteOne({ _id: entry._id }).exec();
  }

  async empty(): Promise<{ deleted: number }> {
    const result = await this.entryModel.deleteMany({}).exec();
    await this.itemModel.deleteMany({}).exec();
    return { deleted: result.deletedCount ?? 0 };
  }
}
