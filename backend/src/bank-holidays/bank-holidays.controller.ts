import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { BankHolidaysService } from './bank-holidays.service';
import { CreateBankHolidayDto } from './dto/create-bank-holiday.dto';

@Controller('bank-holidays')
export class BankHolidaysController {
  constructor(private readonly bankHolidaysService: BankHolidaysService) {}

  @RequirePermission('settings.manage')
  @Post()
  create(@Body() dto: CreateBankHolidayDto) {
    return this.bankHolidaysService.create(dto);
  }

  // Not gated: read by the Bookings calendar and invoice/quote item picker to
  // check a product's day-type restriction.
  @Get()
  findAll() {
    return this.bankHolidaysService.findAll();
  }

  @RequirePermission('settings.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateBankHolidayDto) {
    return this.bankHolidaysService.update(id, dto);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bankHolidaysService.remove(id);
  }
}
