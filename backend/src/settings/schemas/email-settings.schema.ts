import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Singleton-style collection: exactly one document holds the whole
// business's Microsoft 365 (Graph API) sending configuration.
@Schema({ timestamps: true })
export class EmailSettings extends Document {
  @Prop()
  tenantId?: string;

  @Prop()
  clientId?: string;

  // Stored as ciphertext (iv:authTag:data) via EncryptionService — never plain text at rest.
  @Prop()
  clientSecretEncrypted?: string;

  @Prop()
  fromAddress?: string;

  @Prop()
  fromName?: string;
}

export const EmailSettingsSchema = SchemaFactory.createForClass(EmailSettings);
