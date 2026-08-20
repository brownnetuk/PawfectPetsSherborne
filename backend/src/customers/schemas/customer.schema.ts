import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum CustomerStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  // Set by staff on an already-registered customer to prompt them to review and
  // refresh their details via the same public registration link. Distinct from
  // PENDING (a brand-new lead that's never completed registration).
  UPDATE_INFO = 'update_info',
}

@Schema({ _id: false })
class EmergencyContact {
  @Prop({ default: false })
  sameAsClient: boolean;

  @Prop()
  name?: string;

  @Prop()
  address?: string;

  @Prop()
  telephone?: string;

  @Prop()
  mobile?: string;

  @Prop()
  email?: string;
}
const EmergencyContactSchema = SchemaFactory.createForClass(EmergencyContact);

@Schema({ _id: false })
class EmergencyVet {
  @Prop({ required: true })
  practiceName: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  telephone: string;

  @Prop()
  email?: string;

  @Prop({ required: true })
  alternativeVetAuthorised: boolean;
}
const EmergencyVetSchema = SchemaFactory.createForClass(EmergencyVet);

@Schema({ _id: false })
class SecurityArrangements {
  @Prop({ default: false })
  keysProvided: boolean;

  // Stored as ciphertext (iv:authTag:data) via EncryptionService — never plain text at rest.
  @Prop()
  alarmInstructionsEncrypted?: string;

  @Prop()
  furtherInformation?: string;
}
const SecurityArrangementsSchema = SchemaFactory.createForClass(SecurityArrangements);

@Schema({ _id: false })
class Agreement {
  @Prop()
  signedName?: string;

  @Prop()
  signatureImage?: string;

  @Prop()
  signedAt?: Date;

  @Prop()
  date?: Date;
}
const AgreementSchema = SchemaFactory.createForClass(Agreement);

@Schema({ timestamps: true })
export class Customer extends Document {
  @Prop({ required: true })
  name: string;

  // Optional at the schema level so staff can pre-create a minimal lead
  // (name + email only); the public intake form fills in the rest and
  // CustomersService enforces completeness before flipping status to active.
  @Prop()
  address?: string;

  @Prop()
  telephone?: string;

  @Prop()
  mobile?: string;

  @Prop({ required: true })
  email: string;

  @Prop({ type: EmergencyContactSchema })
  emergencyContact?: EmergencyContact;

  @Prop({ type: EmergencyVetSchema })
  emergencyVet?: EmergencyVet;

  @Prop({ type: SecurityArrangementsSchema, default: {} })
  security: SecurityArrangements;

  @Prop({ type: AgreementSchema, default: {} })
  agreement: Agreement;

  @Prop({ type: String, enum: CustomerStatus, default: CustomerStatus.PENDING })
  status: CustomerStatus;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
