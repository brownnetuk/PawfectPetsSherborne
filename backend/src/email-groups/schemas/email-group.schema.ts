import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';

// A named, staff-curated list of customers -- Settings > Email > Email
// Groups. Membership is static (hand-picked), not a saved search/rule, so
// "who's in this group" never silently changes when a customer's other
// details do.
@Schema({ timestamps: true })
export class EmailGroup extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: Customer.name, default: [] })
  customers: Types.ObjectId[];
}

export const EmailGroupSchema = SchemaFactory.createForClass(EmailGroup);
