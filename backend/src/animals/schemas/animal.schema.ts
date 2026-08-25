import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';

export enum Species {
  DOG = 'dog',
  CAT = 'cat',
  OTHER = 'other',
}

export enum Sex {
  MALE = 'male',
  FEMALE = 'female',
}

export enum TriState {
  YES = 'yes',
  NO = 'no',
  UNSURE = 'unsure',
}

export enum LeadMode {
  ON_LEAD = 'on_lead',
  OFF_LEAD = 'off_lead',
}

export enum NeuteredStatus {
  NEUTERED = 'neutered',
  SPAYED = 'spayed',
  NO = 'no',
}

@Schema({ _id: false })
class AllergyInfo {
  @Prop({ type: String, enum: TriState, required: true })
  status: TriState;

  @Prop()
  details?: string;
}
const AllergyInfoSchema = SchemaFactory.createForClass(AllergyInfo);

@Schema({ _id: false })
class MedicationEntry {
  @Prop({ required: true })
  name: string;

  @Prop()
  illnessTreating?: string;

  @Prop()
  dosage?: string;

  @Prop()
  frequency?: string;

  @Prop({ required: true })
  vetPrescribed: boolean;

  @Prop({ required: true })
  administeredByPawfectPets: boolean;

  @Prop()
  additionalInfo?: string;
}
const MedicationEntrySchema = SchemaFactory.createForClass(MedicationEntry);

@Schema({ _id: false })
class MedicationInfo {
  @Prop({ required: true })
  onMedication: boolean;

  @Prop({ type: [MedicationEntrySchema], default: [] })
  medications?: MedicationEntry[];

  // Superseded by `medications` above (a single free-text field replaced by a
  // repeatable structured list) -- kept read-only so animals recorded before
  // this change still show what was typed, rather than silently going blank.
  // Never written by current code.
  @Prop()
  details?: string;
}
const MedicationInfoSchema = SchemaFactory.createForClass(MedicationInfo);

@Schema({ _id: false })
class OffLeadConsent {
  @Prop({ type: String, enum: LeadMode, required: true })
  mode: LeadMode;

  @Prop()
  signature?: string;

  @Prop()
  acknowledgedAt?: Date;

  @Prop()
  date?: Date;
}
const OffLeadConsentSchema = SchemaFactory.createForClass(OffLeadConsent);

@Schema({ timestamps: true })
export class Animal extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Customer.name,
    required: true,
    index: true,
  })
  customer: Types.ObjectId;

  @Prop({ type: String, enum: Species, required: true })
  species: Species;

  @Prop({ required: true })
  breed: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: Sex, required: true })
  sex: Sex;

  @Prop({ required: true, min: 0 })
  age: number;

  // Optional, alongside age rather than replacing it -- staff/customers may
  // not always know an exact birth date (e.g. a rescue), so age stays the
  // one required field.
  @Prop()
  dateOfBirth?: Date;

  @Prop({ required: true })
  vaccinated: boolean;

  @Prop()
  vaccineExpiryDate?: Date;

  // Base64 data URIs, same storage approach as Customer.agreement.signatureImage
  // and BusinessInfo.logoImage -- no filesystem/blob storage needed. Capped at
  // 2 photos, enforced in CreateAnimalDto.
  @Prop({ type: [String] })
  photos?: string[];

  @Prop()
  colourMarkings?: string;

  @Prop()
  microchipNumber?: string;

  @Prop()
  insured?: boolean;

  // Only meaningful when insured is true.
  @Prop()
  insurer?: string;

  @Prop({ type: String, enum: NeuteredStatus })
  neuteredStatus?: NeuteredStatus;

  // Only meaningful when neuteredStatus is 'spayed'.
  @Prop()
  lastSeasonEndDate?: Date;

  @Prop()
  temperamentNotes?: string;

  @Prop({ required: true })
  aggressionToPeople: boolean;

  @Prop()
  aggressionToPeopleDetails?: string;

  // Not applicable to cats.
  @Prop()
  aggressionToOtherAnimals?: boolean;

  @Prop()
  aggressionToOtherAnimalsDetails?: string;

  // Not applicable to cats.
  @Prop({ type: String, enum: TriState })
  travelsWellInCar?: TriState;

  // Dogs only.
  @Prop({ type: String, enum: TriState })
  chasesLivestock?: TriState;

  @Prop()
  chasesLivestockDetails?: string;

  @Prop({ type: AllergyInfoSchema, required: true })
  allergies: AllergyInfo;

  @Prop({ type: MedicationInfoSchema, required: true })
  medication: MedicationInfo;

  // Dogs only; omitted/undefined for cats and other species.
  @Prop({ type: OffLeadConsentSchema })
  offLeadConsent?: OffLeadConsent;
}

export const AnimalSchema = SchemaFactory.createForClass(Animal);
