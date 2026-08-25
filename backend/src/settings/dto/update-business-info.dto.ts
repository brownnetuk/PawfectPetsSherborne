import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

// All plain @IsString() (no @IsEmail() on `email`) so every field, including
// email, can genuinely be cleared by saving it blank -- unlike
// UpdateEmailSettingsDto's fromAddress, there's no format validation here to
// fight with an intentionally-empty string.
export class UpdateBusinessInfoDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  town?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  logoImage?: string;

  // Base64 data URI of a newly-uploaded .docx, re-parsed into termsHtml on save --
  // undefined means "leave the stored terms alone" (the client only has the
  // already-parsed HTML after loading, not the original file, so there's nothing
  // to resend unless staff pick a new one), '' means "remove the stored terms".
  @IsOptional()
  @IsString()
  termsFile?: string;

  @IsOptional()
  @IsString()
  termsFileName?: string;

  @IsOptional()
  @IsString()
  termsVersion?: string;

  @IsOptional()
  @IsString()
  termsDocumentDate?: string;

  @IsOptional()
  @IsString()
  emergencyVetAuthorisationText?: string;

  @IsOptional()
  @IsString()
  offLeadConsentText?: string;

  @IsOptional()
  @IsString()
  declarationText?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  depositPercentage?: number;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  sortCode?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  invoiceNotesMessage?: string;

  @IsOptional()
  @IsString()
  quoteNotesMessage?: string;

  @IsOptional()
  @IsString()
  invoiceNumberTemplate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  invoiceNextNumber?: number;

  @IsOptional()
  @IsString()
  quoteNumberTemplate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quoteNextNumber?: number;

  @IsOptional()
  @IsString()
  paymentNumberTemplate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  paymentNextNumber?: number;

  @IsOptional()
  @IsString()
  creditNoteNumberTemplate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creditNoteNextNumber?: number;

  // Opaque staff-authored layout JSON (see BusinessInfo.invoicePdfTemplate) --
  // no @ValidateNested()/@Type() on the array elements, so arbitrary per-element
  // keys pass through the global whitelist untouched rather than being stripped.
  @IsOptional()
  @IsArray()
  invoicePdfTemplate?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trustedIps?: string[];
}
