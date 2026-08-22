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

  // firstName/surname are the source of truth; `name` is computed from them
  // by CustomersService on every create/update (see customer-format.util.ts).
  @Prop()
  firstName?: string;

  @Prop()
  surname?: string;

  @Prop()
  name?: string;

  // address1/town/postcode etc. are the source of truth; `address` is computed
  // from them by CustomersService on every create/update.
  @Prop()
  address1?: string;

  @Prop()
  address2?: string;

  @Prop()
  town?: string;

  @Prop()
  county?: string;

  @Prop()
  postcode?: string;

  @Prop()
  address?: string;

  @Prop()
  phoneNumber?: string;

  @Prop()
  email?: string;
}
const EmergencyContactSchema = SchemaFactory.createForClass(EmergencyContact);

@Schema({ _id: false })
class EmergencyVetAuthorisation {
  @Prop()
  signedName?: string;

  @Prop()
  signatureImage?: string;

  @Prop()
  signedAt?: Date;
}
const EmergencyVetAuthorisationSchema = SchemaFactory.createForClass(EmergencyVetAuthorisation);

@Schema({ _id: false })
class EmergencyVet {
  @Prop({ required: true })
  practiceName: string;

  // address1/town/postcode etc. are the source of truth; `address` is computed
  // from them by CustomersService on every create/update.
  @Prop()
  address1?: string;

  @Prop()
  address2?: string;

  @Prop()
  town?: string;

  @Prop()
  county?: string;

  @Prop()
  postcode?: string;

  @Prop()
  address?: string;

  @Prop({ required: true })
  telephone: string;

  @Prop()
  email?: string;

  @Prop({ type: EmergencyVetAuthorisationSchema })
  authorisation?: EmergencyVetAuthorisation;

  // Computed from `!!authorisation?.signedName` by CustomersService, kept for
  // existing boolean consumers (e.g. the mobile app doesn't read this at all,
  // but other backend/admin code may).
  @Prop()
  alternativeVetAuthorised?: boolean;
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

  // Snapshotted from BusinessInfo.termsVersion/termsDocumentDate at the moment
  // of signing (server-side, not client-supplied) so the record always shows
  // which terms revision this customer actually agreed to, even if the
  // business's terms are updated later.
  @Prop()
  termsVersion?: string;

  @Prop()
  termsDocumentDate?: string;
}
const AgreementSchema = SchemaFactory.createForClass(Agreement);

@Schema({ timestamps: true })
export class Customer extends Document {
  // firstName/surname are the source of truth; `name` is computed from them
  // by CustomersService on every create/update. Both stay optional at the
  // schema level so staff can pre-create a minimal lead (name + email only);
  // the public intake form fills in the rest and CustomersService enforces
  // completeness before flipping status to active.
  @Prop()
  firstName?: string;

  @Prop()
  surname?: string;

  @Prop({ required: true })
  name: string;

  // address1/town/postcode etc. are the source of truth; `address` is computed
  // from them by CustomersService on every create/update.
  @Prop()
  address1?: string;

  @Prop()
  address2?: string;

  @Prop()
  town?: string;

  @Prop()
  county?: string;

  @Prop()
  postcode?: string;

  @Prop()
  address?: string;

  @Prop()
  phoneNumber?: string;

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
