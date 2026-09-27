import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { CONTENT_BLOCK_TYPES } from '../schemas/training-module.schema';

export class ContentBlockDto {
  @IsNumber()
  order: number;

  @IsIn(CONTENT_BLOCK_TYPES)
  type: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  readingText?: string;

  @IsOptional()
  @IsString()
  pdfFile?: string;

  @IsOptional()
  @IsString()
  pdfFileName?: string;
}
