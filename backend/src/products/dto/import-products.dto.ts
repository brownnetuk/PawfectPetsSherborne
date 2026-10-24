import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

// Rows parsed client-side from the Settings > Products CSV import -- each one
// is matched to an existing product by productCode and overwritten, or
// created when no product has that code.
export class ImportProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  products: CreateProductDto[];
}
