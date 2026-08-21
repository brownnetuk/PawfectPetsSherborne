import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// The fixed set of places in the app that can offer "send an email" as an
// alternative to "copy this link" -- kept in sync by hand with the admin
// frontend locations that call POST /settings/email/send.
export enum EmailTrigger {
  REGISTRATION = 'registration',
  UPDATE_INFO = 'update_info',
  ADD_PET = 'add_pet',
}

// One document per trigger (enforced via the unique index below) -- avoids
// any ambiguity at send time about which template to use.
@Schema({ timestamps: true })
export class EmailTemplate extends Document {
  @Prop({ type: String, enum: EmailTrigger, required: true, unique: true })
  trigger: EmailTrigger;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string;
}

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
