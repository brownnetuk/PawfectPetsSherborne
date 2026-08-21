import { IsArray, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { EnquiryService } from '../schemas/enquiry.schema';

export class CreateEnquiryDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  howHeard?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(EnquiryService, { each: true })
  servicesInterested?: EnquiryService[];

  @IsOptional()
  @IsString()
  notes?: string;
}
