import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Base64 data: URI of the price-list PDF the staff app just built
// client-side -- same pattern as SendBookingConfirmationDto.
export class SendPriceListDto {
  @IsNotEmpty()
  @IsString()
  recipientName: string;

  @IsEmail()
  recipientEmail: string;

  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
