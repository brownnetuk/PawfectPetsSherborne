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
