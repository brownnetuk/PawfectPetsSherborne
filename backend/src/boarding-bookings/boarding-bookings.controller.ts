import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { BoardingBookingsService } from './boarding-bookings.service';
import { AmendBoardingBookingDatesDto } from './dto/amend-boarding-booking-dates.dto';
import { CreateBoardingBookingDto } from './dto/create-boarding-booking.dto';
import { RequestPaymentDto } from './dto/request-payment.dto';

@Controller('boarding-bookings')
export class BoardingBookingsController {
  constructor(private readonly boardingBookingsService: BoardingBookingsService) {}

  @Get()
  async findAll() {
    const bookings = await this.boardingBookingsService.findAll();
    return Promise.all(bookings.map((b) => this.boardingBookingsService.withStatus(b)));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const booking = await this.boardingBookingsService.findOne(id);
    return this.boardingBookingsService.withStatus(booking);
  }

  @Post()
  create(@Body() dto: CreateBoardingBookingDto, @CurrentUser() user: CurrentUserShape) {
    return this.boardingBookingsService.createDirect(dto, user.name);
  }

  @Patch(':id/amend-dates')
  amendDates(@Param('id') id: string, @Body() dto: AmendBoardingBookingDatesDto) {
    return this.boardingBookingsService.amendDates(id, dto);
  }

  @Post(':id/request-payment')
  requestPayment(
    @Param('id') id: string,
    @Body() dto: RequestPaymentDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.boardingBookingsService.requestPayment(id, dto.type, user.name);
  }

  @Post(':id/send-pre-check-in')
  sendPreCheckIn(@Param('id') id: string) {
    return this.boardingBookingsService.sendPreCheckIn(id);
  }

  @Post(':id/check-in')
  recordCheckIn(
    @Param('id') id: string,
    @Body('submission') submissionId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.boardingBookingsService.recordCheckIn(id, submissionId, user.name);
  }

  @Post(':id/check-out')
  recordCheckOut(
    @Param('id') id: string,
    @Body('submission') submissionId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.boardingBookingsService.recordCheckOut(id, submissionId, user.name);
  }

}
