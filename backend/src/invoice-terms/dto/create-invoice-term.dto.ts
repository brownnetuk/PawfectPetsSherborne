import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateInvoiceTermDto {
  @IsNotEmpty()
  @IsString()
  text: string;

  // null explicitly clears a previously-set value (e.g. switching a term to
  // endOfMonth) -- @IsOptional() skips validation for both undefined and null.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  plusDays?: number | null;

  @IsOptional()
  @IsBoolean()
  endOfMonth?: boolean;
}
