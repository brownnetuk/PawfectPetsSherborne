import { ArrayNotEmpty, IsArray, IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class CreatePushMessageDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  body: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  customerIds: string[];
}
