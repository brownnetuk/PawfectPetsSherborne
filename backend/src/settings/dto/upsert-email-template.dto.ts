import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertEmailTemplateDto {
  // Optional custom "Used for" title; unset falls back to the built-in label.
  @IsOptional()
  @IsString()
  label?: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsNotEmpty()
  @IsString()
  body: string;
}
