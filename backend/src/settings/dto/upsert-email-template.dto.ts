import { IsNotEmpty, IsString } from 'class-validator';

export class UpsertEmailTemplateDto {
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
