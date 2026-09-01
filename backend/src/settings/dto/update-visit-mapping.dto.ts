import { IsMongoId, IsOptional, ValidateIf } from 'class-validator';

// null explicitly clears a mapping back to unconfigured -- @ValidateIf so
// it's allowed through despite @IsMongoId, same pattern as
// CreateCustomerDto.defaultProduct/travelProduct.
export class UpdateVisitMappingDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  oneVisitWeekdayProduct?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  oneVisitWeekendProduct?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  oneVisitBankHolidayProduct?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  twoVisitWeekdayProduct?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  twoVisitWeekendProduct?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsMongoId()
  twoVisitBankHolidayProduct?: string | null;
}
