import { IsNotEmpty, IsString } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
