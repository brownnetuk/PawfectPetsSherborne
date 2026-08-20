import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceStatus } from './schemas/invoice.schema';

@Injectable()
export class InvoicesService {
  constructor(@InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>) {}

  private calculateTotals(lineItems: { quantity: number; unitPrice: number }[], tax = 0) {
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return { subtotal, tax, total: subtotal + tax };
  }

  private async nextInvoiceNumber(): Promise<string> {
    const count = await this.invoiceModel.countDocuments().exec();
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    const totals = this.calculateTotals(dto.lineItems, dto.tax ?? 0);
    const invoiceNumber = await this.nextInvoiceNumber();
    const created = new this.invoiceModel({
      ...dto,
      invoiceNumber,
      ...totals,
      status: InvoiceStatus.DRAFT,
    });
    return created.save();
  }

  findAll(customerId?: string): Promise<Invoice[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.invoiceModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email')
      .exec();
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceModel
      .findById(id)
      .populate('customer', 'name email')
      .exec();
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.lineItems) {
      update.lineItems = dto.lineItems;
      Object.assign(update, this.calculateTotals(dto.lineItems, dto.tax ?? 0));
    }
    if (dto.status === InvoiceStatus.PAID) {
      update.paidAt = new Date();
    }
    const invoice = await this.invoiceModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email')
      .exec();
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }

  async remove(id: string): Promise<void> {
    const result = await this.invoiceModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
  }
}
