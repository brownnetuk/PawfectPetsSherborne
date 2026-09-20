import { IsArray, IsBoolean } from 'class-validator';

export class UpdateChecklistAssignmentDto {
  @IsArray()
  @IsBoolean({ each: true })
  completed: boolean[];
}
