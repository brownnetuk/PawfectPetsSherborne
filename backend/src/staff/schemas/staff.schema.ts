import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Staff extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  // bcrypt hash — never expose this field in API responses.
  @Prop({ required: true })
  passwordHash: string;
}

export const StaffSchema = SchemaFactory.createForClass(Staff);
