import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

export class MedicationEntryDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  illnessTreating?: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsBoolean()
  vetPrescribed: boolean;

  @IsBoolean()
  administeredByPawfectPets: boolean;

  @IsOptional()
  @IsString()
  additionalInfo?: string;
}

export class MedicationInfoDto {
  @IsBoolean()
  onMedication: boolean;

  @ValidateIf((o) => o.onMedication)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MedicationEntryDto)
  medications?: MedicationEntryDto[];
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

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsBoolean()
  vaccinated: boolean;

  @ValidateIf((o) => o.vaccinated)
  @IsNotEmpty()
  @IsDateString()
  vaccineExpiryDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsString()
  colourMarkings?: string;

  @IsOptional()
  @IsString()
  microchipNumber?: string;

  @IsOptional()
  @IsString()
  temperamentNotes?: string;

  @IsBoolean()
  aggressionToPeople: boolean;

  @ValidateIf((o) => o.aggressionToPeople)
  @IsNotEmpty()
  @IsString()
  aggressionToPeopleDetails?: string;

  // Not applicable to cats; service-layer validation rejects it when species=cat.
  @IsOptional()
  @IsBoolean()
  aggressionToOtherAnimals?: boolean;

  @ValidateIf((o) => o.aggressionToOtherAnimals)
  @IsNotEmpty()
  @IsString()
  aggressionToOtherAnimalsDetails?: string;

  // Not applicable to cats; service-layer validation rejects it when species=cat.
  @IsOptional()
  @IsEnum(TriState)
  travelsWellInCar?: TriState;

  // Dogs only; service-layer validation rejects it for cats and other species.
  @IsOptional()
  @IsEnum(TriState)
  chasesLivestock?: TriState;

  @ValidateIf((o) => o.chasesLivestock === TriState.YES)
  @IsNotEmpty()
  @IsString()
  chasesLivestockDetails?: string;

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
