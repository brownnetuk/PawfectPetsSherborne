import { IsDateString, IsOptional, IsString } from 'class-validator';

// Notes and the sign-off signature -- item ticking has its own endpoint/DTO
// (see toggle-checklist-item.dto.ts) since it needs the logged-in staff
// member attributed server-side, not client-supplied.
export class UpdateChecklistAssignmentDto {
  @IsOptional()
  @IsString()
  notes?: string;

  // Base64 PNG data URI from the signature pad; an empty string clears it.
  @IsOptional()
  @IsString()
  signatureImage?: string;

  // Back-dates/corrects when the sign-off happened (e.g. a checklist done on
  // paper earlier and entered later). Only applied to an already-signed
  // checklist; who signed it stays server-side.
  @IsOptional()
  @IsDateString()
  signedAt?: string;
}
