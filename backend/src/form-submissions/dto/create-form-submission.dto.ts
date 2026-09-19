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

  // Set when generating a link for one specific pet -- see
  // FormSubmissionsService.create() and SendFormModal's pet multi-select.
  @IsOptional()
  @IsMongoId()
  animal?: string;

  @IsNotEmpty()
  @IsEmail()
  recipientEmail: string;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
