import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  productCode: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  // null explicitly clears a previously-set restriction back to "no
  // restriction" -- @IsOptional() skips validation for both undefined and null.
  @IsOptional()
  @IsIn(['weekday', 'weekend', 'bank_holiday'])
  availability?: 'weekday' | 'weekend' | 'bank_holiday' | null;
}
