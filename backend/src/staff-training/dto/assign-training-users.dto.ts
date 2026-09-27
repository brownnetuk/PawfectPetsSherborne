import { IsArray, IsMongoId } from 'class-validator';

export class AssignTrainingUsersDto {
  @IsArray()
  @IsMongoId({ each: true })
  staffIds: string[];
}
