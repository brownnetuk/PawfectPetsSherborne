import { IsNotEmpty, IsString } from 'class-validator';

// Base64 data: URI of the PDF the admin just built client-side of this
// submission -- same pattern as SendPaymentReceiptDto.
export class SendFormSubmissionCopyDto {
  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
