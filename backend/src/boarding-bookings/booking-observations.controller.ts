import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { BookingObservationsService } from './booking-observations.service';
import { BookingObservationDto } from './dto/booking-observation.dto';

@Controller('boarding-bookings/:bookingId/observations')
export class BookingObservationsController {
  constructor(
    private readonly observationsService: BookingObservationsService,
  ) {}

  @Get()
  findAll(@Param('bookingId') bookingId: string) {
    return this.observationsService.findForBooking(bookingId);
  }

  @Post()
  create(
    @Param('bookingId') bookingId: string,
    @Body() dto: BookingObservationDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.observationsService.create(bookingId, dto, user.name);
  }

  @Patch(':id')
  update(
    @Param('bookingId') bookingId: string,
    @Param('id') id: string,
    @Body() dto: BookingObservationDto,
  ) {
    return this.observationsService.update(bookingId, id, dto);
  }

  @Delete(':id')
  remove(@Param('bookingId') bookingId: string, @Param('id') id: string) {
    return this.observationsService.remove(bookingId, id);
  }
}
