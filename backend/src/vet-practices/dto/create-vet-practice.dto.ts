import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateVetPracticeDto {
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
