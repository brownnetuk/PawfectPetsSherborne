import { IsArray, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendEmailMessageDto {
  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsNotEmpty()
  @IsString()
  bodyHtml: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  groupIds?: string[];
}
