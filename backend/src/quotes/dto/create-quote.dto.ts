import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class LineItemDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

// See QuoteVisitPlan in ../schemas/quote.schema.ts -- the Visits section of
// the admin quote form, persisted so accepting the quote can create the
// matching DayBookings.
export class QuoteVisitPlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  animals: string[];

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsIn(['1', '2'])
  visitsPerDay: string;

  @IsIn(['1', '2'])
  visitsFirstDay: string;

  @IsIn(['1', '2'])
  visitsLastDay: string;
}

export class CreateQuoteDto {
  // Exactly one of `customer` or manualCustomerName+manualCustomerEmail is
  // required -- enforced in QuotesService.create() (a "one of" constraint
  // isn't easily declarative with class-validator).
  @IsOptional()
  @IsMongoId()
  customer?: string;

  @IsOptional()
  @IsString()
  manualCustomerName?: string;

  @IsOptional()
  @IsEmail()
  manualCustomerEmail?: string;

  @IsOptional()
  @IsMongoId()
  booking?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];

  @IsDateString()
  issueDate: string;

  // Ignored on create — quotes are always valid for 7 days from the issue date
  // (set in QuotesService.create). Optional so clients needn't send it.
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  // null explicitly clears a previously-saved plan (e.g. staff emptied the
  // Visits section while editing the quote).
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => QuoteVisitPlanDto)
  visitPlan?: QuoteVisitPlanDto | null;
}
