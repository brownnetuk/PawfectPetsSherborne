import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { SubmitFormSubmissionDto } from '../form-submissions/dto/submit-form-submission.dto';
import { BookingIncidentReportsService } from './booking-incident-reports.service';
import { MoveIncidentReportDto } from './dto/move-incident-report.dto';

// Filling a report in goes through the ordinary form-submission endpoints
// (GET /form-submissions/:id/public, POST /form-submissions/:id/submit) --
// these just manage which submissions belong to the booking.
@Controller('boarding-bookings/:bookingId/incident-reports')
export class BookingIncidentReportsController {
  constructor(private readonly incidentReportsService: BookingIncidentReportsService) {}

  @Get()
  findAll(@Param('bookingId') bookingId: string) {
    return this.incidentReportsService.findForBooking(bookingId);
  }

  @Post()
  create(@Param('bookingId') bookingId: string) {
    return this.incidentReportsService.create(bookingId);
  }

  @Patch(':id')
  update(
    @Param('bookingId') bookingId: string,
    @Param('id') id: string,
    @Body() dto: SubmitFormSubmissionDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.incidentReportsService.updateAnswers(bookingId, id, dto.answers, user.name);
  }

  @Patch(':id/booking')
  move(
    @Param('bookingId') bookingId: string,
    @Param('id') id: string,
    @Body() dto: MoveIncidentReportDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.incidentReportsService.move(bookingId, id, dto.booking, user.name);
  }

  @Delete(':id')
  remove(@Param('bookingId') bookingId: string, @Param('id') id: string) {
    return this.incidentReportsService.remove(bookingId, id);
  }
}

// Every booking's reports at once -- Boarding & Day Care > Incident Reports.
@Controller('incident-reports')
export class IncidentReportsController {
  constructor(private readonly incidentReportsService: BookingIncidentReportsService) {}

  @Get()
  findAll() {
    return this.incidentReportsService.findAll();
  }
}
