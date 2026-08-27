import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @RequirePermission('settings.manage')
  @Post()
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(dto);
  }

  // Not gated: read as a dropdown when any staff member records a payment.
  @Get()
  findAll() {
    return this.paymentMethodsService.findAll();
  }

  @RequirePermission('settings.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.update(id, dto);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentMethodsService.remove(id);
  }
}
