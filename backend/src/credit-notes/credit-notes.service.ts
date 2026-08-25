import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';
import { formatDocumentNumber, nextSequenceNumber } from '../common/document-number.util';
import { InvoicesService } from '../invoices/invoices.service';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { CreditNote } from './schemas/credit-note.schema';

@Injectable()
export class CreditNotesService {
  constructor(
    @InjectModel(CreditNote.name) private readonly creditNoteModel: Model<CreditNote>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly invoicesService: InvoicesService,
    private readonly bankAccountsService: BankAccountsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async nextCreditNoteNumber(): Promise<string> {
    const seq = await nextSequenceNumber(this.businessInfoModel, 'creditNoteNextNumber');
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.creditNoteNumberTemplate || 'CN-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  async create(dto: CreateCreditNoteDto, actor = 'Staff'): Promise<CreditNote> {
    const creditNoteNumber = await this.nextCreditNoteNumber();
    const saved = await new this.creditNoteModel({ ...dto, creditNoteNumber }).save();
    // Reducing what a customer owes/has paid on an invoice via a credit note
    // is exactly what reversing a payment already does -- reuse it rather
    // than duplicate the amountPaid/paid-status logic.
    if (dto.invoice) {
      await this.invoicesService.reversePayment(dto.invoice, dto.amount);
    }
    if (dto.account) {
      await this.bankAccountsService.adjustBalance(dto.account, -dto.amount);
    }
    await this.auditLogService.record(
      dto.customer,
      AuditEventType.CREDIT_NOTE_ISSUED,
      'Credit note issued',
      `${creditNoteNumber} — £${dto.amount.toFixed(2)} — ${dto.reason}`,
      dto.amount,
      actor,
      undefined,
      undefined,
      dto.invoice,
    );
    return saved;
  }

  findAll(customerId?: string): Promise<CreditNote[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.creditNoteModel
      .find(filter)
      .sort({ date: -1, createdAt: -1 })
      .populate('customer', 'name email')
      .populate('invoice', 'invoiceNumber')
      .populate('account', 'name type')
      .exec();
  }

  async remove(id: string, actor = 'Staff'): Promise<void> {
    const creditNote = await this.creditNoteModel.findByIdAndDelete(id).exec();
    if (!creditNote) {
      throw new NotFoundException(`Credit note ${id} not found`);
    }
    // Undoes both side effects issuing it caused -- see create() above.
    if (creditNote.invoice) {
      await this.invoicesService.applyPayment(creditNote.invoice.toString(), creditNote.amount);
    }
    if (creditNote.account) {
      await this.bankAccountsService.adjustBalance(creditNote.account, creditNote.amount);
    }
    await this.auditLogService.record(
      creditNote.customer,
      AuditEventType.CREDIT_NOTE_REMOVED,
      'Credit note removed',
      `${creditNote.creditNoteNumber} — £${creditNote.amount.toFixed(2)} removed`,
      creditNote.amount,
      actor,
      undefined,
      undefined,
      creditNote.invoice,
    );
  }
}
