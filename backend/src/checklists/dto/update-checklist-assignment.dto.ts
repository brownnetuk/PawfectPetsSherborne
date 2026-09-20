import { IsOptional, IsString } from 'class-validator';

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
}
