import { IsNotEmpty, IsString } from 'class-validator';

export class CreateVendorDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
