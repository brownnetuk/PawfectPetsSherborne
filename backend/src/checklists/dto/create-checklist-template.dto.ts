import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChecklistTemplateDto {
  @IsIn(['boarding', 'dayCare'])
  category: 'boarding' | 'dayCare';

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  completeByTime?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  items: string[];

  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;
}
