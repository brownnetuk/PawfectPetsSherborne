import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export const RECYCLE_BIN_ITEMS_COLLECTION = 'recyclebinitems';

export interface RecycleBinRelink {
  collection: string;
  id: Types.ObjectId;
  field: string;
}

// One deleted record, exactly as it was in its own collection (`doc`, raw
// BSON, so ids/dates/binary come back byte-for-byte on restore). Kept one
// per document rather than as an array on the entry so a big cascade -- a
// customer with years of invoices and photo-heavy observations -- can't run
// into MongoDB's 16MB document limit.
@Schema({ collection: RECYCLE_BIN_ITEMS_COLLECTION, versionKey: false })
export class RecycleBinItem extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  entry: Types.ObjectId;

  // Order deleted within the entry. Restore goes in reverse, so a customer
  // is put back before their invoices, and an invoice before its payments.
  @Prop({ required: true })
  order: number;

  @Prop({ required: true })
  collectionName: string;

  @Prop({ required: true })
  modelName: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  docId: unknown;

  @Prop({ required: true })
  typeLabel: string;

  @Prop({ required: true })
  label: string;

  @Prop()
  customerName?: string;

  // Arrays this record was $pull-ed out of as part of the delete (e.g. a
  // boarding booking's incidentReports), so restore can put it back.
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  relinks: RecycleBinRelink[];

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  doc: Record<string, unknown>;
}

export const RecycleBinItemSchema =
  SchemaFactory.createForClass(RecycleBinItem);
