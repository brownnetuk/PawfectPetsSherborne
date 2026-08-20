import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ActivityType } from '../schemas/crm-activity.schema';

export class CreateCrmActivityDto {
  @IsMongoId()
  customer: string;

  @IsEnum(ActivityType)
  type: ActivityType;

  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsNotEmpty()
  @IsString()
  createdBy: string;
}
