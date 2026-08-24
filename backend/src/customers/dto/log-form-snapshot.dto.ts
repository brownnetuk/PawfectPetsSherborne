import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LogFormSnapshotDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  // When given (the "sent" entry SettingsService.sendTriggeredEmail already
  // created, with its tracking pixel embedded), the snapshot attaches to
  // that existing entry instead of creating a second one -- `title` above
  // is ignored in that case, since the entry already has the right one.
  @IsOptional()
  @IsMongoId()
  entryId?: string;

  // Base64 data: URI -- see AuditLogEntry.attachmentData's own comment for why.
  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
