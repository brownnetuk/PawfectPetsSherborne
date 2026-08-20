import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Sex, Species, TriState, LeadMode } from '../schemas/animal.schema';

export class AllergyInfoDto {
  @IsEnum(TriState)
  status: TriState;

  @ValidateIf((o) => o.status !== TriState.NO)
  @IsOptional()
  @IsString()
  details?: string;
}

export class MedicationInfoDto {
  @IsBoolean()
  onMedication: boolean;

  @ValidateIf((o) => o.onMedication)
  @IsNotEmpty()
  @IsString()
  details?: string;
}

export class OffLeadConsentDto {
  @IsEnum(LeadMode)
  mode: LeadMode;

  @ValidateIf((o) => o.mode === LeadMode.OFF_LEAD)
  @IsNotEmpty()
  @IsString()
  signature?: string;
}

export class CreateAnimalDto {
  @IsMongoId()
  customer: string;

  @IsEnum(Species)
  species: Species;

  @IsNotEmpty()
  @IsString()
  breed: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEnum(Sex)
  sex: Sex;

  @IsInt()
  @Min(0)
  age: number;

  @IsBoolean()
  vaccinated: boolean;

  @ValidateIf((o) => o.vaccinated)
  @IsNotEmpty()
  @IsDateString()
  vaccineExpiryDate?: string;

  @IsOptional()
  @IsString()
  colourMarkings?: string;

  @IsOptional()
  @IsString()
  microchipNumber?: string;

  @IsBoolean()
  hasCollar: boolean;

  @IsOptional()
  @IsString()
  temperamentNotes?: string;

  @IsBoolean()
  aggressionToPeople: boolean;

  @IsBoolean()
  aggressionToOtherAnimals: boolean;

  @IsEnum(TriState)
  travelsWellInCar: TriState;

  @IsEnum(TriState)
  chasesLivestock: TriState;

  @ValidateNested()
  @Type(() => AllergyInfoDto)
  allergies: AllergyInfoDto;

  @ValidateNested()
  @Type(() => MedicationInfoDto)
  medication: MedicationInfoDto;

  // Required by service-layer validation when species === dog; omitted otherwise.
  @IsOptional()
  @ValidateNested()
  @Type(() => OffLeadConsentDto)
  offLeadConsent?: OffLeadConsentDto;
}
