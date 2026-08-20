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

@Schema({ _id: false })
class AllergyInfo {
  @Prop({ type: String, enum: TriState, required: true })
  status: TriState;

  @Prop()
  details?: string;
}
const AllergyInfoSchema = SchemaFactory.createForClass(AllergyInfo);

@Schema({ _id: false })
class MedicationInfo {
  @Prop({ required: true })
  onMedication: boolean;

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
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
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

  @Prop({ required: true })
  vaccinated: boolean;

  @Prop()
  vaccineExpiryDate?: Date;

  @Prop()
  colourMarkings?: string;

  @Prop()
  microchipNumber?: string;

  @Prop({ required: true })
  hasCollar: boolean;

  @Prop()
  temperamentNotes?: string;

  @Prop({ required: true })
  aggressionToPeople: boolean;

  @Prop()
  aggressionToPeopleDetails?: string;

  @Prop({ required: true })
  aggressionToOtherAnimals: boolean;

  @Prop()
  aggressionToOtherAnimalsDetails?: string;

  @Prop({ type: String, enum: TriState, required: true })
  travelsWellInCar: TriState;

  @Prop({ type: String, enum: TriState, required: true })
  chasesLivestock: TriState;

  @Prop({ type: AllergyInfoSchema, required: true })
  allergies: AllergyInfo;

  @Prop({ type: MedicationInfoSchema, required: true })
  medication: MedicationInfo;

  // Dogs only; omitted/undefined for cats and other species.
  @Prop({ type: OffLeadConsentSchema })
  offLeadConsent?: OffLeadConsent;
}

export const AnimalSchema = SchemaFactory.createForClass(Animal);
