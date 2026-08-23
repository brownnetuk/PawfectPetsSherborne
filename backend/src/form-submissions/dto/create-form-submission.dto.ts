import {
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

// Staff "generate a link" for one recipient -- see FormSubmissionsService.create().
export class CreateFormSubmissionDto {
  @IsMongoId()
  form: string;

  @IsOptional()
  @IsMongoId()
  customer?: string;

  @IsNotEmpty()
  @IsEmail()
  recipientEmail: string;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
