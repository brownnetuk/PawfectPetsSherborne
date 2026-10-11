import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  MAX_OBSERVATION_PHOTOS,
  OBSERVATION_CATEGORIES,
} from '../schemas/booking-observation.schema';
import type { ObservationCategory } from '../schemas/booking-observation.schema';

// Used for both create and update -- the form always sends every field.
export class BookingObservationDto {
  @IsDateString()
  observedAt: string;

  @IsIn(OBSERVATION_CATEGORIES)
  category: ObservationCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OBSERVATION_PHOTOS)
  @IsString({ each: true })
  @Matches(/^data:image\//, {
    each: true,
    message: 'Each photo must be an image',
  })
  photos?: string[];
}
