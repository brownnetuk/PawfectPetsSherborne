import { IsNotEmpty, IsString } from 'class-validator';

export class ReplaceAttachmentDto {
  // Base64 data: URI -- see AuditLogEntry.attachmentData's own comment for why.
  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
