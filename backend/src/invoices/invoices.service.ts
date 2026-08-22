import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { buildItemsTableHtml, formatUkDate } from '../common/invoice-email.util';
import { formatDocumentNumber, nextSequenceNumber } from '../common/document-number.util';
import { publicApiUrl, trackingPixelHtml } from '../common/tracking-pixel.util';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceStatus } from './schemas/invoice.schema';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
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

  // Atomically reads the current invoiceNextNumber (creating the settings
  // singleton with defaults if it doesn't exist yet) and increments it in the
  // same operation, so two invoices created at once can never get the same
  // number -- the returned document is the state *before* the increment,
  // which is exactly the number this invoice should use.
  private async nextInvoiceNumber(): Promise<string> {
    const seq = await nextSequenceNumber(this.businessInfoModel, 'invoiceNextNumber');
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.invoiceNumberTemplate || 'INV-{year}-{seq}';
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

  // Flips any invoice still sitting at "sent" past its due date to "overdue".
  // Run at the top of findAll() rather than on a schedule (e.g. @nestjs/schedule's
  // @Cron) -- the free Render plan this backend runs on spins the process down
  // after inactivity, so a background timer wouldn't fire while asleep and
  // could leave invoices stale for however long nobody was using the app. A
  // plain conditional updateMany on every list fetch is cheap at this app's
  // scale and self-heals immediately whenever staff next open the page,
  // regardless of how long the backend was asleep.
  private async markOverdue(): Promise<void> {
    await this.invoiceModel
      .updateMany({ status: InvoiceStatus.SENT, dueDate: { $lt: new Date() } }, { status: InvoiceStatus.OVERDUE })
      .exec();
  }

  async findAll(customerId?: string): Promise<Invoice[]> {
    await this.markOverdue();
    const filter = customerId ? { customer: customerId } : {};
    return this.invoiceModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email address phoneNumber')
      .exec();
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceModel
      .findById(id)
      .populate('customer', 'name email address phoneNumber')
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
      .populate('customer', 'name email address phoneNumber')
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

  /** Emails the invoice to its customer using the "Invoice Template", then marks it sent if it was still a draft. */
  async sendEmail(id: string): Promise<Invoice> {
    const invoice = await this.findOne(id);
    const customer = invoice.customer as unknown as { name?: string; email?: string };
    if (!customer?.email) {
      throw new BadRequestException('This customer has no email address on file.');
    }
    const business = await this.businessInfoModel.findOne().exec();
    const pixelUrl = `${publicApiUrl()}/invoices/${id}/pixel.gif`;
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.INVOICE,
      customer.email,
      {
        customer_name: customer.name,
        subject: invoice.subject,
        invoice_number: invoice.invoiceNumber,
        invoice_date: formatUkDate(invoice.issueDate),
        due_date: formatUkDate(invoice.dueDate),
        subtotal: invoice.subtotal.toFixed(2),
        total: invoice.total.toFixed(2),
        bank_name: business?.bankName,
        sort_code: business?.sortCode,
        account_number: business?.accountNumber,
      },
      { items_table: buildItemsTableHtml(invoice.lineItems) },
      trackingPixelHtml(pixelUrl),
    );
    if (invoice.status === InvoiceStatus.DRAFT) {
      return this.update(id, { status: InvoiceStatus.SENT });
    }
    return invoice;
  }

  /** First-open only -- called by the public GET /invoices/:id/pixel.gif when the sent email's tracking pixel loads. */
  async markOpened(id: string): Promise<void> {
    await this.invoiceModel.updateOne({ _id: id, openedAt: { $exists: false } }, { openedAt: new Date() }).exec();
  }

  /** Adds a recorded payment's amount to amountPaid, flipping status to paid once it covers the total. */
  async applyPayment(id: string, amount: number): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(id).exec();
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    const amountPaid = (invoice.amountPaid ?? 0) + amount;
    const update: Record<string, unknown> = { amountPaid };
    if (amountPaid >= invoice.total) {
      update.status = InvoiceStatus.PAID;
      update.paidAt = new Date();
    }
    const updated = await this.invoiceModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email address phoneNumber')
      .exec();
    return updated!;
  }

  // Undoes applyPayment when the Payment record that caused it is deleted.
  // Reverts a since-flipped `paid` status back to `sent` rather than trying to
  // guess `overdue` -- markOverdue() re-flags it on the next list fetch if the
  // due date has in fact passed, so this doesn't need to duplicate that logic.
  async reversePayment(id: string, amount: number): Promise<void> {
    const invoice = await this.invoiceModel.findById(id).exec();
    if (!invoice) return;
    const amountPaid = Math.max(0, (invoice.amountPaid ?? 0) - amount);
    const revertingPaidStatus = invoice.status === InvoiceStatus.PAID && amountPaid < invoice.total;
    await this.invoiceModel
      .updateOne(
        { _id: id },
        {
          $set: { amountPaid, ...(revertingPaidStatus ? { status: InvoiceStatus.SENT } : {}) },
          ...(revertingPaidStatus ? { $unset: { paidAt: '' } } : {}),
        },
      )
      .exec();
  }
}
