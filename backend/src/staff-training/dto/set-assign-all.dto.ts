import { IsBoolean } from 'class-validator';

export class SetAssignAllDto {
  @IsBoolean()
  enabled: boolean;
}
