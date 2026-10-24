import { IsMongoId } from 'class-validator';

export class MoveIncidentReportDto {
  // The boarding booking the report should belong to instead.
  @IsMongoId()
  booking: string;
}
