import { IsMongoId } from 'class-validator';

export class CopyAnimalDto {
  @IsMongoId()
  customerId: string;
}

export class MoveAnimalDto {
  @IsMongoId()
  customerId: string;
}
