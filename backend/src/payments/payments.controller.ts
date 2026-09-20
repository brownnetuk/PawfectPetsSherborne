import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SendPaymentReceiptDto } from './dto/send-payment-receipt.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: CurrentUserShape) {
    return this.paymentsService.create(dto, user.name);
  }

  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @RequirePermission('financial.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.paymentsService.update(id, dto, user.name);
  }

  @RequirePermission('financial.manage')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.paymentsService.remove(id, user.name);
  }

  @Post(':id/send-email')
  sendReceivedEmail(@Param('id') id: string) {
    return this.paymentsService.sendReceivedEmail(id);
  }

  @Post(':id/send-receipt')
  sendReceipt(@Param('id') id: string, @Body() dto: SendPaymentReceiptDto) {
    return this.paymentsService.sendReceipt(id, {
      data: dto.attachmentData,
      name: dto.attachmentName,
    });
  }
}
