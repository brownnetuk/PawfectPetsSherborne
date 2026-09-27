import { IsArray, IsNumber, IsString, ArrayMinSize } from 'class-validator';

export class QuestionDto {
  @IsString()
  text: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options: string[];

  @IsNumber()
  correctIndex: number;
}
