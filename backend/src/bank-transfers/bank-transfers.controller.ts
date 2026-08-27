import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { BankTransfersService } from './bank-transfers.service';
import { CreateBankTransferDto } from './dto/create-bank-transfer.dto';

@Controller('bank-transfers')
export class BankTransfersController {
  constructor(private readonly bankTransfersService: BankTransfersService) {}

  @Post()
  create(@Body() dto: CreateBankTransferDto) {
    return this.bankTransfersService.create(dto);
  }

  @Get()
  findAll() {
    return this.bankTransfersService.findAll();
  }

  @RequirePermission('financial.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bankTransfersService.remove(id);
  }
}
