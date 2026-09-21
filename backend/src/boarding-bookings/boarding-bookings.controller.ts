import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { BoardingBookingsService } from './boarding-bookings.service';
import { AmendBoardingBookingDatesDto } from './dto/amend-boarding-booking-dates.dto';
import { CreateBoardingBookingDto } from './dto/create-boarding-booking.dto';
import { RequestPaymentDto } from './dto/request-payment.dto';
import { SetBoardingBookingStatusDto } from './dto/set-boarding-booking-status.dto';

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

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() dto: SetBoardingBookingStatusDto) {
    // setStatus() returns the saved doc with `invoice` unpopulated (just an
    // id) -- re-fetch via findOne() (which populates it) before wrapping,
    // same reasoning as withStatus()'s own comment about not trusting an
    // unpopulated `invoice` field.
    await this.boardingBookingsService.setStatus(id, dto.status);
    const booking = await this.boardingBookingsService.findOne(id);
    return this.boardingBookingsService.withStatus(booking);
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

  @RequirePermission('bookings.manage')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.boardingBookingsService.remove(id, user.name);
  }
}
