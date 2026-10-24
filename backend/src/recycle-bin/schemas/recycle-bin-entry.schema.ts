import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const RECYCLE_BIN_ENTRIES_COLLECTION = 'recyclebinentries';

// One "Delete" action -- the header for every record that action removed,
// which are stored one per RecycleBinItem (see that schema for why). Written
// directly by recycleBinPlugin through the raw collection, so the field
// names here are the contract between the two.
@Schema({ collection: RECYCLE_BIN_ENTRIES_COLLECTION, versionKey: false })
export class RecycleBinEntry extends Document {
  @Prop({ required: true, index: true })
  deletedAt: Date;

  @Prop({ required: true })
  deletedBy: string;

  // The request path the delete came in on, e.g. /customers/<id> -- shown
  // nowhere, but handy when tracing where an entry came from.
  @Prop()
  path?: string;

  // Ids in that path, used to pick which captured record the entry is
  // listed as (see RecycleBinService.findAll()).
  @Prop({ type: [String], default: [] })
  pathIds: string[];
}

export const RecycleBinEntrySchema =
  SchemaFactory.createForClass(RecycleBinEntry);
