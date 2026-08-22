import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

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

  @Get(':id/transactions')
  getTransactions(
    @Param('id') id: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const now = new Date();
    return this.bankAccountsService.getTransactions(
      id,
      month ? Number(month) : now.getMonth() + 1,
      year ? Number(year) : now.getFullYear(),
    );
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bankAccountsService.remove(id);
  }
}
