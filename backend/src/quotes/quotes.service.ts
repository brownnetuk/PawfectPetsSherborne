import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { formatDocumentNumber } from '../common/document-number.util';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { Quote, QuoteStatus } from './schemas/quote.schema';

@Injectable()
export class QuotesService {
  constructor(
    @InjectModel(Quote.name) private readonly quoteModel: Model<Quote>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
  ) {}

  private calculateTotals(lineItems: { quantity: number; unitPrice: number; discountPercent?: number }[]) {
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice * (1 - (item.discountPercent ?? 0) / 100),
      0,
    );
    return { subtotal, total: subtotal };
  }

  // Same atomic get-and-increment approach as InvoicesService.nextInvoiceNumber --
  // see that method's comment.
  private async nextQuoteNumber(): Promise<string> {
    const before = await this.businessInfoModel
      .findOneAndUpdate({}, { $inc: { quoteNextNumber: 1 } }, { upsert: true, new: false })
      .exec();
    const seq = before?.quoteNextNumber ?? 1;
    const template = before?.quoteNumberTemplate || 'QUO-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  async create(dto: CreateQuoteDto): Promise<Quote> {
    const totals = this.calculateTotals(dto.lineItems);
    const quoteNumber = await this.nextQuoteNumber();
    const created = new this.quoteModel({
      ...dto,
      quoteNumber,
      ...totals,
      status: QuoteStatus.DRAFT,
    });
    return created.save();
  }

  findAll(customerId?: string): Promise<Quote[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.quoteModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email')
      .exec();
  }

  async findOne(id: string): Promise<Quote> {
    const quote = await this.quoteModel
      .findById(id)
      .populate('customer', 'name email')
      .exec();
    if (!quote) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    return quote;
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<Quote> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.lineItems) {
      update.lineItems = dto.lineItems;
      Object.assign(update, this.calculateTotals(dto.lineItems));
    }
    const quote = await this.quoteModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email')
      .exec();
    if (!quote) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    return quote;
  }

  async remove(id: string): Promise<void> {
    const result = await this.quoteModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
  }
}
