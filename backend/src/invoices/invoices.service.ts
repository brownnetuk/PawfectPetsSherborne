import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { formatDocumentNumber } from '../common/document-number.util';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceStatus } from './schemas/invoice.schema';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
  ) {}

  private calculateTotals(lineItems: { quantity: number; unitPrice: number; discountPercent?: number }[]) {
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice * (1 - (item.discountPercent ?? 0) / 100),
      0,
    );
    return { subtotal, total: subtotal };
  }

  // Atomically reads the current invoiceNextNumber (creating the settings
  // singleton with defaults if it doesn't exist yet) and increments it in the
  // same operation, so two invoices created at once can never get the same
  // number -- the returned document is the state *before* the increment,
  // which is exactly the number this invoice should use.
  private async nextInvoiceNumber(): Promise<string> {
    const before = await this.businessInfoModel
      .findOneAndUpdate({}, { $inc: { invoiceNextNumber: 1 } }, { upsert: true, new: false })
      .exec();
    const seq = before?.invoiceNextNumber ?? 1;
    const template = before?.invoiceNumberTemplate || 'INV-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    const totals = this.calculateTotals(dto.lineItems);
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
      Object.assign(update, this.calculateTotals(dto.lineItems));
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
