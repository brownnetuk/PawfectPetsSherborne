import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';

@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  create(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.create(dto);
  }

  @Get()
  findAll() {
    return this.bankAccountsService.findAll();
  }

  // Either ?from=YYYY-MM-DD&to=YYYY-MM-DD (both inclusive, either may be
  // left empty for an open end; ?all=1 with neither means the whole history)
  // or the older ?month=&year= (defaults to the current month).
  @Get(':id/transactions')
  getTransactions(
    @Param('id') id: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('all') all?: string,
  ) {
    if (from || to || all) {
      const toDate = parseDay(to);
      if (toDate) toDate.setDate(toDate.getDate() + 1);
      return this.bankAccountsService.getTransactions(id, { from: parseDay(from), to: toDate });
    }
    const now = new Date();
    const m = month ? Number(month) : now.getMonth() + 1;
    const y = year ? Number(year) : now.getFullYear();
    return this.bankAccountsService.getTransactions(id, {
      from: new Date(y, m - 1, 1),
      to: new Date(y, m, 1),
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.update(id, dto);
  }

  @Patch(':id/opening-balance')
  setOpeningBalance(@Param('id') id: string, @Body() dto: SetOpeningBalanceDto) {
    return this.bankAccountsService.setOpeningBalance(id, dto);
  }

  @RequirePermission('financial.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bankAccountsService.remove(id);
  }
}

// 'YYYY-MM-DD' -> local midnight that day, same convention as the month/year
// period boundaries; anything else is treated as not given.
function parseDay(value?: string): Date | undefined {
  const match = value && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
