import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// The fixed set of places in the app that can offer "send an email" as an
// alternative to "copy this link" -- kept in sync by hand with the admin
// frontend locations that call POST /settings/email/send. INVOICE/QUOTE are
// different: they're sent via POST /invoices/:id/send and /quotes/:id/send
// (SettingsService.sendTemplatedEmail), not /settings/email/send, and their
// template body is edited as raw HTML rather than plain text -- see
// interpolateBody in settings.service.ts. DEPOSIT_REQUEST is sent via
// POST /invoices/:id/request-deposit (InvoicesService.requestDeposit) --
// same plain-text template style as REGISTRATION/UPDATE_INFO/etc., just a
// different dedicated endpoint like INVOICE/QUOTE.
export enum EmailTrigger {
  REGISTRATION = 'registration',
  UPDATE_INFO = 'update_info',
  ADD_PET = 'add_pet',
  INVOICE = 'invoice',
  QUOTE = 'quote',
  PAYMENT_RECEIVED = 'payment_received',
  FORM = 'form',
  DEPOSIT_REQUEST = 'deposit_request',
  // Customer portal: first-time login code and password-reset code.
  PORTAL_LOGIN_CODE = 'portal_login_code',
  PORTAL_PASSWORD_RESET = 'portal_password_reset',
  // Sent to a customer when staff switch on their Customer Portal access.
  PORTAL_ENABLED = 'portal_enabled',
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
