import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateChecklistTemplateDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  items: string[];
}
