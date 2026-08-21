import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateInvoiceTermDto } from './dto/create-invoice-term.dto';
import { InvoiceTerm } from './schemas/invoice-term.schema';

@Injectable()
export class InvoiceTermsService {
  constructor(
    @InjectModel(InvoiceTerm.name) private readonly invoiceTermModel: Model<InvoiceTerm>,
  ) {}

  async create(dto: CreateInvoiceTermDto): Promise<InvoiceTerm> {
    if (dto.isDefault) {
      await this.clearOtherDefaults();
    }
    return new this.invoiceTermModel(dto).save();
  }

  findAll(): Promise<InvoiceTerm[]> {
    return this.invoiceTermModel.find().sort({ createdAt: -1 }).exec();
  }

  async update(id: string, dto: CreateInvoiceTermDto): Promise<InvoiceTerm> {
    if (dto.isDefault) {
      await this.clearOtherDefaults(id);
    }
    const term = await this.invoiceTermModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!term) {
      throw new NotFoundException(`Invoice term ${id} not found`);
    }
    return term;
  }

  // Only one term can be the default at a time -- unset it on every other
  // term before the caller sets it on theirs, rather than relying on a
  // unique index (a boolean "at most one true" constraint isn't expressible
  // that way in Mongo).
  private async clearOtherDefaults(exceptId?: string): Promise<void> {
    const filter = exceptId ? { _id: { $ne: exceptId } } : {};
    await this.invoiceTermModel.updateMany(filter, { isDefault: false }).exec();
  }

  async remove(id: string): Promise<void> {
    const result = await this.invoiceTermModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Invoice term ${id} not found`);
    }
  }
}
