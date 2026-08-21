import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A reusable catalog entry for invoice/quote line items -- not referenced by
// Invoice/Quote directly (their line items are still freeform), just a lookup
// list staff can copy details from when building one.
@Schema({ timestamps: true })
export class Product extends Document {
  @Prop({ required: true })
  productCode: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0 })
  price: number;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
