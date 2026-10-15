import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePreBoardingFormDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  surname?: string;

  @IsEmail()
  email: string;

  // The owner types each dog's name on the form itself.
  @IsInt()
  @Min(1)
  @Max(10)
  dogCount: number;
}
