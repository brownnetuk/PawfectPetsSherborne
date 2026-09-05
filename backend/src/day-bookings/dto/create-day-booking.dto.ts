import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsMongoId, IsOptional, Matches, Min, ValidateIf } from 'class-validator';

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  // null explicitly clears an explicit AM/PM override back to inferred.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['AM', 'PM'])
  visitTime?: 'AM' | 'PM' | null;

  // Day Care (single-day) and Boarding (first/last day) fields -- see
  // DayBooking schema for how each is used.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['AM', 'PM'])
  dropOffPeriod?: 'AM' | 'PM' | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(TIME_FORMAT, { message: 'dropOffTime must be in HH:mm format' })
  dropOffTime?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['AM', 'PM'])
  collectionPeriod?: 'AM' | 'PM' | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(TIME_FORMAT, { message: 'collectionTime must be in HH:mm format' })
  collectionTime?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(TIME_FORMAT, { message: 'pickUpTime must be in HH:mm format' })
  pickUpTime?: string | null;
}
