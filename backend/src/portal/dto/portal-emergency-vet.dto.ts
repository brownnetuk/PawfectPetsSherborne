import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Like the customer EmergencyVetDto, but `authorisation` is omitted — the
// portal never re-signs the alternative-vet authorisation. CustomersService
// .update() carries any existing authorisation forward when it isn't supplied.
export class PortalEmergencyVetDto {
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
}
