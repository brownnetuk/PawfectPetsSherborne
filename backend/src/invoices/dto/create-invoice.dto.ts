import { Type } from 'class-transformer';
import { QuoteBoardingPlanDto, QuoteDayCarePlanDto, QuoteVisitPlanDto } from '../../quotes/dto/create-quote.dto';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
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

export class CreateInvoiceDto {
  @IsMongoId()
  customer: string;

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

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  // Copied from the source quote when an accepted quote converts -- see
  // QuotesService.acceptAndConvert(). A quote only ever carries one of the
  // three at a time.
  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteVisitPlanDto)
  visitPlan?: QuoteVisitPlanDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteDayCarePlanDto)
  dayCarePlan?: QuoteDayCarePlanDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteBoardingPlanDto)
  boardingPlan?: QuoteBoardingPlanDto;
}
