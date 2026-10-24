import type { Collection, Db, Document as MongoDocument } from 'mongodb';
import { Document, Query, Schema, Types } from 'mongoose';
import {
  actorFromContext,
  currentRecycleBinContext,
  pathIds,
  RecycleBinContext,
} from './recycle-bin.context';
import { describeRecord, typeLabel } from './recycle-bin.describe';
import { RECYCLE_BIN_ENTRIES_COLLECTION } from './schemas/recycle-bin-entry.schema';
import {
  RECYCLE_BIN_ITEMS_COLLECTION,
  RecycleBinRelink,
} from './schemas/recycle-bin-item.schema';

// Collections whose deletes are never binned: the bin itself (emptying it
// has to be a real delete), and short-lived plumbing nobody would want back
// -- a phone's push registration on sign-out, the staff notification bell
// being cleared.
const NOT_BINNED = new Set([
  RECYCLE_BIN_ENTRIES_COLLECTION,
  RECYCLE_BIN_ITEMS_COLLECTION,
  'pushtokens',
  'notificationitems',
]);

const DELETE_QUERIES = ['deleteOne', 'deleteMany', 'findOneAndDelete'] as const;
const UPDATE_QUERIES = ['updateOne', 'updateMany', 'findOneAndUpdate'] as const;

type DeleteQuery = Query<unknown, unknown> & { op: string };

// Mongoose's typings for pre/post with an op list *and* the
// query/document option don't resolve to any overload; the runtime API
// is exactly this.
type Hooks = {
  pre(
    ops: readonly string[] | string,
    opts: { query: boolean; document: boolean },
    fn: (this: never) => unknown,
  ): void;
  post(
    ops: readonly string[] | string,
    opts: { query: boolean; document: boolean },
    fn: (this: never) => unknown,
  ): void;
};

// Snapshot taken in the pre hook, keyed by the query/document so the post
// hook can find it.
const pending = new WeakMap<
  object,
  {
    ctx: RecycleBinContext;
    db: Db;
    collection: Collection;
    itemIds: Types.ObjectId[];
    docIds: unknown[];
  }
>();

// Registered on the app's connection (app.module.ts), so it applies to every
// model. While a DELETE request is running (see recycle-bin.context.ts),
// every record any service deletes is first copied into the Recycle Bin,
// before the delete itself runs -- if that copy can't be written, the delete
// fails rather than losing the record. Afterwards, any copy whose record
// turned out not to have been deleted after all is dropped again.
//
// This works at the database layer rather than by changing each service's
// remove(), so every existing delete (and any added later) is covered, and
// nothing else in the app has to learn to hide "deleted" records -- they
// really are gone from their own collection until restored.
export function recycleBinPlugin(mongooseSchema: Schema): void {
  const schema = mongooseSchema as unknown as Hooks;
  schema.pre(
    DELETE_QUERIES,
    { query: true, document: false },
    async function (this: DeleteQuery) {
      const ctx = currentRecycleBinContext();
      if (!ctx || NOT_BINNED.has(this.model.collection.collectionName)) return;
      const db = this.model.db.db!;
      const collection = db.collection(this.model.collection.collectionName);
      const filter = this.cast(this.model, this.getFilter()) as Record<
        string,
        unknown
      >;
      const docs =
        this.op === 'deleteMany'
          ? await collection.find(filter).toArray()
          : [
              await collection.findOne(filter, {
                sort: (this.getOptions().sort ?? undefined) as never,
              }),
            ].filter((d): d is NonNullable<typeof d> => d != null);
      await capture(this, ctx, db, collection, this.model.modelName, docs);
    },
  );

  schema.post(
    DELETE_QUERIES,
    { query: true, document: false },
    async function (this: DeleteQuery) {
      await settle(this);
    },
  );

  // doc.deleteOne() (e.g. PreBoardingService.remove()). Mongoose may also run
  // the query-level hook above for the same delete; `ctx.captured` stops it
  // being stored twice.
  schema.pre(
    'deleteOne',
    { document: true, query: false },
    async function (this: Document) {
      const ctx = currentRecycleBinContext();
      const model = this.constructor as unknown as ModelLike;
      if (!ctx || NOT_BINNED.has(model.collection.collectionName)) return;
      const db = model.db.db!;
      const collection = db.collection(model.collection.collectionName);
      const doc = await collection.findOne({ _id: this._id as never });
      await capture(
        this,
        ctx,
        db,
        collection,
        model.modelName,
        doc ? [doc] : [],
      );
    },
  );

  schema.post(
    'deleteOne',
    { document: true, query: false },
    async function (this: Document) {
      await settle(this);
    },
  );

  // Remembers ids $pull-ed out of an array during the request, so a record
  // deleted straight afterwards knows where it was linked from.
  schema.pre(
    UPDATE_QUERIES,
    { query: true, document: false },
    function (this: DeleteQuery) {
      const ctx = currentRecycleBinContext();
      if (!ctx) return;
      const update = this.getUpdate() as Record<string, unknown> | null;
      const pull = update?.$pull as Record<string, unknown> | undefined;
      if (!pull) return;
      const id = (this.getFilter() as { _id?: unknown })._id;
      if (!id || (typeof id === 'object' && !(id instanceof Types.ObjectId)))
        return;
      for (const [field, value] of Object.entries(pull)) {
        if (
          value instanceof Types.ObjectId ||
          (typeof value === 'string' && Types.ObjectId.isValid(value))
        ) {
          ctx.pulls.push({
            collection: this.model.collection.collectionName,
            ids: [new Types.ObjectId(String(id))],
            field,
            value: String(value),
          });
        }
      }
    },
  );
}

// Everything below goes through the driver's own Db/Collection rather than
// Mongoose's, so reads and the bin copy see raw documents -- including
// fields a schema marks `select: false` -- and nothing here re-enters
// Mongoose's hooks.
type ModelLike = {
  collection: { collectionName: string };
  db: { db?: Db };
  modelName: string;
};

async function capture(
  key: object,
  ctx: RecycleBinContext,
  db: Db,
  collection: Collection,
  modelName: string,
  docs: MongoDocument[],
): Promise<void> {
  const fresh = docs.filter(
    (d) => !ctx.captured.has(`${collection.collectionName}:${String(d._id)}`),
  );
  if (fresh.length === 0) return;
  for (const d of fresh)
    ctx.captured.add(`${collection.collectionName}:${String(d._id)}`);

  ctx.entryReady ??= db
    .collection(RECYCLE_BIN_ENTRIES_COLLECTION)
    .insertOne({
      _id: ctx.entryId,
      deletedAt: new Date(),
      deletedBy: actorFromContext(ctx),
      path: (ctx.req.originalUrl ?? ctx.req.url).split('?')[0],
      pathIds: pathIds(ctx.req),
    })
    .then(() => undefined);
  await ctx.entryReady;

  if (modelName === 'Customer') {
    for (const d of fresh)
      if (typeof d.name === 'string')
        ctx.customerNames.set(String(d._id), d.name);
  }

  const items: MongoDocument[] = [];
  for (const doc of fresh) {
    const relinks: RecycleBinRelink[] = ctx.pulls
      .filter((p) => p.value === String(doc._id))
      .flatMap((p) =>
        p.ids.map((id) => ({ collection: p.collection, id, field: p.field })),
      );
    items.push({
      _id: new Types.ObjectId(),
      entry: ctx.entryId,
      order: ctx.seq++,
      collectionName: collection.collectionName,
      modelName,
      docId: doc._id,
      typeLabel: typeLabel(modelName),
      label: describeRecord(modelName, doc),
      customerName: await customerName(ctx, db, modelName, doc),
      relinks,
      doc,
    });
  }
  await db.collection(RECYCLE_BIN_ITEMS_COLLECTION).insertMany(items);
  pending.set(key, {
    ctx,
    db,
    collection,
    itemIds: items.map((i) => i._id as Types.ObjectId),
    docIds: fresh.map((d) => d._id),
  });
}

async function customerName(
  ctx: RecycleBinContext,
  db: Db,
  modelName: string,
  doc: MongoDocument,
): Promise<string | undefined> {
  if (modelName === 'Customer')
    return typeof doc.name === 'string' ? doc.name : undefined;
  let id = doc.customer;
  // Payments and credit notes only point at their invoice -- which, even in
  // a cascade, is deleted after them, so is still there to ask.
  if (
    !(id instanceof Types.ObjectId) &&
    doc.invoice instanceof Types.ObjectId
  ) {
    const invoice = await db
      .collection('invoices')
      .findOne({ _id: doc.invoice }, { projection: { customer: 1 } });
    id = invoice?.customer;
  }
  if (!(id instanceof Types.ObjectId)) return undefined;
  const known = ctx.customerNames.get(String(id));
  if (known) return known;
  const customer = await db
    .collection('customers')
    .findOne({ _id: id }, { projection: { name: 1 } });
  if (typeof customer?.name === 'string') {
    ctx.customerNames.set(String(id), customer.name);
    return customer.name;
  }
  return undefined;
}

// Drops the bin copy of anything the delete didn't actually remove (a
// delete that matched nothing, or lost a race with another request).
async function settle(key: object): Promise<void> {
  const snapshot = pending.get(key);
  if (!snapshot) return;
  pending.delete(key);
  const survivors = await snapshot.collection
    .find(
      { _id: { $in: snapshot.docIds as never[] } },
      { projection: { _id: 1 } },
    )
    .toArray();
  if (survivors.length === 0) return;
  const survived = new Set(survivors.map((s) => String(s._id)));
  await snapshot.db
    .collection(RECYCLE_BIN_ITEMS_COLLECTION)
    .deleteMany({
      _id: { $in: snapshot.itemIds },
      docId: { $in: survivors.map((s) => s._id) },
    });
  for (const id of survived)
    snapshot.ctx.captured.delete(`${snapshot.collection.collectionName}:${id}`);
}
