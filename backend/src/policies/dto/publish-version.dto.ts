import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PublishVersionDto {
  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;
}
