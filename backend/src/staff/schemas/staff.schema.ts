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

  // Break-glass accounts skip Business Info > Trusted IPs entirely at login
  // (see AuthService.login) -- an intentional, explicitly-labelled exception
  // for when the trusted-IP list is wrong/stale and normal accounts are
  // locked out, not a general-purpose flag. Password auth is still required
  // as normal; this only bypasses the IP check.
  @Prop({ default: false })
  isBreakGlass?: boolean;
}

export const StaffSchema = SchemaFactory.createForClass(Staff);
