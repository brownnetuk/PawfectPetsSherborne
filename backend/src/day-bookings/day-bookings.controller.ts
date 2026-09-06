import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { DayBookingsService } from './day-bookings.service';
import { CreateDayBookingDto } from './dto/create-day-booking.dto';
import { UpdateDayBookingDto } from './dto/update-day-booking.dto';

@Controller('day-bookings')
export class DayBookingsController {
  constructor(private readonly dayBookingsService: DayBookingsService) {}

  @Post()
  create(@Body() dto: CreateDayBookingDto) {
    return this.dayBookingsService.create(dto);
  }

  // from/to are the calendar's visible range (inclusive/exclusive, see
  // DayBookingsService.findForRange) -- required rather than defaulting to
  // "everything", since a month view could otherwise pull years of history.
  @Get()
  findForRange(@Query('from') from: string, @Query('to') to: string) {
    return this.dayBookingsService.findForRange(from, to);
  }

  // Not gated: read by the Customer Detail page's Bookings tab.
  @Get('by-customer/:customerId')
  findForCustomer(@Param('customerId') customerId: string) {
    return this.dayBookingsService.findForCustomer(customerId);
  }

  // The product breakdown for a boarding stay (whole 24h boarding days + a
  // leftover Half/Full Day Care day), resolved to the configured products --
  // the admin's New Booking modal calls this, then creates the day bookings.
  @Get('boarding-plan')
  boardingPlan(
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('dogCount') dogCount: string,
  ) {
    return this.dayBookingsService.computeBoardingPlan(start, end, Number(dogCount) || 1);
  }

  // Every row of one boarding stay -- the admin loads this to edit the stay.
  @Get('stay/:stayId')
  findStay(@Param('stayId') stayId: string) {
    return this.dayBookingsService.findStay(stayId);
  }

  // Deletes a whole boarding stay (used by the admin's edit = delete + recreate).
  @RequirePermission('bookings.manage')
  @Delete('stay/:stayId')
  removeStay(@Param('stayId') stayId: string) {
    return this.dayBookingsService.removeStay(stayId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDayBookingDto) {
    return this.dayBookingsService.update(id, dto);
  }

  @RequirePermission('bookings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dayBookingsService.remove(id);
  }
}
