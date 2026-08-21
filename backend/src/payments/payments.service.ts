import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { formatDocumentNumber, nextSequenceNumber } from '../common/document-number.util';
import { InvoicesService } from '../invoices/invoices.service';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment } from './schemas/payment.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly invoicesService: InvoicesService,
  ) {}

  private async nextPaymentId(): Promise<string> {
    const seq = await nextSequenceNumber(this.businessInfoModel, 'paymentNextNumber');
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.paymentNumberTemplate || 'PAY-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  async create(dto: CreatePaymentDto): Promise<Payment> {
    const paymentId = await this.nextPaymentId();
    const created = new this.paymentModel({ ...dto, paymentId });
    const saved = await created.save();
    // Deducts from the invoice's balance and flips it to paid once fully
    // covered -- see InvoicesService.applyPayment().
    await this.invoicesService.applyPayment(dto.invoice, dto.amount);
    return saved;
  }

  findAll(): Promise<Payment[]> {
    return this.paymentModel
      .find()
      .sort({ date: -1, createdAt: -1 })
      .populate('invoice', 'invoiceNumber')
      .populate('account', 'name type')
      .exec();
  }

  async remove(id: string): Promise<void> {
    const payment = await this.paymentModel.findByIdAndDelete(id).exec();
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    // Undoes the balance deduction (and any resulting `paid` status) this
    // payment caused -- see InvoicesService.reversePayment().
    await this.invoicesService.reversePayment(payment.invoice.toString(), payment.amount);
  }
}
