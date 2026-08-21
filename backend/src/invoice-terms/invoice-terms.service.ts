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

  create(dto: CreateInvoiceTermDto): Promise<InvoiceTerm> {
    return new this.invoiceTermModel(dto).save();
  }

  findAll(): Promise<InvoiceTerm[]> {
    return this.invoiceTermModel.find().sort({ createdAt: -1 }).exec();
  }

  async update(id: string, dto: CreateInvoiceTermDto): Promise<InvoiceTerm> {
    const term = await this.invoiceTermModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!term) {
      throw new NotFoundException(`Invoice term ${id} not found`);
    }
    return term;
  }

  async remove(id: string): Promise<void> {
    const result = await this.invoiceTermModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Invoice term ${id} not found`);
    }
  }
}
