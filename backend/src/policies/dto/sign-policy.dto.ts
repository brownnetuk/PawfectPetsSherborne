import { IsNotEmpty, IsString } from 'class-validator';

export class SignPolicyDto {
  @IsNotEmpty()
  @IsString()
  signedName: string;
}
