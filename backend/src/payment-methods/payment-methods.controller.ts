import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post()
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(dto);
  }

  @Get()
  findAll() {
    return this.paymentMethodsService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentMethodsService.remove(id);
  }
}
