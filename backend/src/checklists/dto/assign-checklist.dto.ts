import { IsDateString, IsMongoId } from 'class-validator';

export class AssignChecklistDto {
  @IsMongoId()
  template: string;

  @IsDateString()
  date: string;
}
