import { IsNotEmpty, IsString } from 'class-validator';

export class PreviewTermsDto {
  @IsNotEmpty()
  @IsString()
  termsFile: string;
}
