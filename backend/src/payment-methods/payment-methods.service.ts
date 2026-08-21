import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { PaymentMethod } from './schemas/payment-method.schema';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectModel(PaymentMethod.name) private readonly paymentMethodModel: Model<PaymentMethod>,
  ) {}

  create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    return new this.paymentMethodModel(dto).save();
  }

  findAll(): Promise<PaymentMethod[]> {
    return this.paymentMethodModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    const method = await this.paymentMethodModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!method) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
    return method;
  }

  async remove(id: string): Promise<void> {
    const result = await this.paymentMethodModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
  }
}
