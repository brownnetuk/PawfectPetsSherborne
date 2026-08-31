import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export class EmergencyContactDto {
  @IsBoolean()
  sameAsClient: boolean;

  @ValidateIf((o) => !o.sameAsClient)
  @IsNotEmpty()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  surname?: string;

  @ValidateIf((o) => !o.sameAsClient)
  @IsNotEmpty()
  @IsString()
  address1?: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @ValidateIf((o) => !o.sameAsClient)
  @IsNotEmpty()
  @IsString()
  town?: string;

  @IsOptional()
  @IsString()
  county?: string;

  @ValidateIf((o) => !o.sameAsClient)
  @IsNotEmpty()
  @IsString()
  postcode?: string;

  @ValidateIf((o) => !o.sameAsClient)
  @IsNotEmpty()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class EmergencyVetAuthorisationDto {
  @IsNotEmpty()
  @IsString()
  signedName: string;

  @IsOptional()
  @IsString()
  signatureImage?: string;
}

export class EmergencyVetDto {
  @IsNotEmpty()
  @IsString()
  practiceName: string;

  @IsNotEmpty()
  @IsString()
  address1: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsNotEmpty()
  @IsString()
  town: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsNotEmpty()
  @IsString()
  postcode: string;

  @IsNotEmpty()
  @IsString()
  telephone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @ValidateNested()
  @Type(() => EmergencyVetAuthorisationDto)
  authorisation: EmergencyVetAuthorisationDto;
}

export class SecurityArrangementsDto {
  @IsOptional()
  @IsBoolean()
  keysProvided?: boolean;

  // Plain text in the request; the service encrypts it before persisting.
  @IsOptional()
  @IsString()
  alarmInstructions?: string;

  @IsOptional()
  @IsString()
  furtherInformation?: string;
}

export class AgreementDto {
  @IsNotEmpty()
  @IsString()
  signedName: string;

  @IsOptional()
  @IsString()
  signatureImage?: string;
}

export class CreateCustomerDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  surname?: string;

  @IsNotEmpty()
  @IsString()
  address1: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsNotEmpty()
  @IsString()
  town: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsNotEmpty()
  @IsString()
  postcode: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact: EmergencyContactDto;

  @ValidateNested()
  @Type(() => EmergencyVetDto)
  emergencyVet: EmergencyVetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SecurityArrangementsDto)
  security?: SecurityArrangementsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgreementDto)
  agreement?: AgreementDto;

  // null explicitly clears the selection -- @ValidateIf so it's allowed
  // through despite @IsMongoId (which would otherwise reject it), same
  // pattern as UpdateStaffDto.role.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  defaultProduct?: string | null;

  @IsOptional()
  @IsBoolean()
  travelChargeable?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  travelProduct?: string | null;

  @IsOptional()
  @IsArray()
  @IsIn(WEEKDAYS, { each: true })
  regularDays?: string[];
}
