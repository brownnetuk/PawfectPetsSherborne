import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Bookings > Check In / Check Out > Export > Email. The report PDF is built
// client-side (admin/src/pdf/checkInOutReportPdf.ts) and POSTed as a base64
// data: URI -- same pattern as SendBookingConfirmationDto.
export class SendCheckInOutReportDto {
  @IsEmail()
  to: string;

  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
