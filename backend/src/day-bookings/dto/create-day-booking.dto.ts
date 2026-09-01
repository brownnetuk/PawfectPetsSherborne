import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsMongoId, IsOptional, Min, ValidateIf } from 'class-validator';

export class CreateDayBookingDto {
  @IsMongoId()
  animal: string;

  @IsDateString()
  date: string;

  @IsMongoId()
  product: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  // Not set on create -- only ever patched in afterward by Generate Invoice.
  // null explicitly clears it, same ValidateIf-around-IsMongoId pattern used
  // elsewhere for a clearable ObjectId reference.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  invoice?: string | null;
}
