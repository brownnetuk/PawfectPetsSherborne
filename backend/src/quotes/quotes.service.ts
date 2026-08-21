import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { buildItemsTableHtml, formatUkDate } from '../common/invoice-email.util';
import { formatDocumentNumber } from '../common/document-number.util';
import { publicApiUrl, trackingPixelHtml } from '../common/tracking-pixel.util';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { Quote, QuoteStatus } from './schemas/quote.schema';

@Injectable()
export class QuotesService {
  constructor(
    @InjectModel(Quote.name) private readonly quoteModel: Model<Quote>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly settingsService: SettingsService,
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

  /** Emails the quote to its customer using the "Quote Template", then marks it sent if it was still a draft. */
  async sendEmail(id: string): Promise<Quote> {
    const quote = await this.findOne(id);
    const customer = quote.customer as unknown as { name?: string; email?: string };
    if (!customer?.email) {
      throw new BadRequestException('This customer has no email address on file.');
    }
    const business = await this.businessInfoModel.findOne().exec();
    const pixelUrl = `${publicApiUrl()}/quotes/${id}/pixel.gif`;
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.QUOTE,
      customer.email,
      {
        customer_name: customer.name,
        subject: quote.subject,
        quote_number: quote.quoteNumber,
        quote_date: formatUkDate(quote.issueDate),
        valid_until: formatUkDate(quote.validUntil),
        subtotal: quote.subtotal.toFixed(2),
        total: quote.total.toFixed(2),
        bank_name: business?.bankName,
        sort_code: business?.sortCode,
        account_number: business?.accountNumber,
      },
      { items_table: buildItemsTableHtml(quote.lineItems) },
      trackingPixelHtml(pixelUrl),
    );
    if (quote.status === QuoteStatus.DRAFT) {
      return this.update(id, { status: QuoteStatus.SENT });
    }
    return quote;
  }

  /** First-open only -- called by the public GET /quotes/:id/pixel.gif when the sent email's tracking pixel loads. */
  async markOpened(id: string): Promise<void> {
    await this.quoteModel.updateOne({ _id: id, openedAt: { $exists: false } }, { openedAt: new Date() }).exec();
  }
}
