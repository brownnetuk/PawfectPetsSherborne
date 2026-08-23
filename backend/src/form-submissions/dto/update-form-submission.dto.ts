import { IsEmail, IsOptional, IsString } from 'class-validator';

// Staff editing a still-pending link's recipient details (e.g. fixing a
// typo'd email before resending) -- see FormSubmissionsService.update() for
// why this is rejected once the submission is completed.
export class UpdateFormSubmissionDto {
  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;
}
