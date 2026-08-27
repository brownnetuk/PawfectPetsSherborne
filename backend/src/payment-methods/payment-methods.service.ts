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

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    if (dto.isDefault) {
      await this.clearOtherDefaults();
    }
    return new this.paymentMethodModel(dto).save();
  }

  findAll(): Promise<PaymentMethod[]> {
    return this.paymentMethodModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    if (dto.isDefault) {
      await this.clearOtherDefaults(id);
    }
    const method = await this.paymentMethodModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!method) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
    return method;
  }

  // Only one method can be the default at a time -- unset it on every other
  // method before the caller sets it on theirs, same reasoning as
  // InvoiceTermsService.clearOtherDefaults (a unique index can't express an
  // "at most one true" constraint on a boolean).
  private async clearOtherDefaults(exceptId?: string): Promise<void> {
    const filter = exceptId ? { _id: { $ne: exceptId } } : {};
    await this.paymentMethodModel.updateMany(filter, { isDefault: false }).exec();
  }

  async remove(id: string): Promise<void> {
    const result = await this.paymentMethodModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
  }
}
