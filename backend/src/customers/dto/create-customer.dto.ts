import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class EmergencyContactDto {
  @IsBoolean()
  sameAsClient: boolean;

  @ValidateIf((o) => !o.sameAsClient)
  @IsNotEmpty()
  @IsString()
  name?: string;

  @ValidateIf((o) => !o.sameAsClient)
  @IsNotEmpty()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class EmergencyVetDto {
  @IsNotEmpty()
  @IsString()
  practiceName: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsString()
  telephone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsBoolean()
  alternativeVetAuthorised: boolean;
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
  name: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsNotEmpty()
  @IsString()
  mobile: string;

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
}
