import {
  IsArray,
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

  // Which of the customer's pets this link is for -- see SendFormModal's
  // pet multi-select and FormSubmissionsService.create(). Omitted/empty:
  // today's plain, no-pet-association submission. Exactly one: a single-pet
  // submission (FormSubmission.animal), fields stay flat. Two or more: one
  // merged submission covering all of them (FormSubmission.animals), with
  // the form's own (unmapped, non-group) fields wrapped into one repeated
  // "per pet" section instead of generating a separate link for each.
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  animals?: string[];

  @IsNotEmpty()
  @IsEmail()
  recipientEmail: string;

  @IsOptional()
  @IsString()
  recipientName?: string;
}
