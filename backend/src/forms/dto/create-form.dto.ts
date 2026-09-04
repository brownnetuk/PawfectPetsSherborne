import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateFormDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  customerVisible?: boolean;

  // Shallow-validated only -- same precedent as BusinessInfo.invoicePdfTemplate's
  // DTO. Real structure is form-field.types.ts's FormField[]; deep per-field
  // validation happens where it matters, at submit time (form-submissions).
  @IsArray()
  fields: Record<string, unknown>[];
}
