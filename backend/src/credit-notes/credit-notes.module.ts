import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { BusinessInfo, BusinessInfoSchema } from '../settings/schemas/business-info.schema';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesService } from './credit-notes.service';
import { CreditNote, CreditNoteSchema } from './schemas/credit-note.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreditNote.name, schema: CreditNoteSchema },
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
    ]),
    // Needed so CreditNotesService can reverse/reapply a credit note's amount
    // against the invoice it's issued on (see InvoicesService.reversePayment/applyPayment).
    InvoicesModule,
    BankAccountsModule,
    AuditLogModule,
  ],
  controllers: [CreditNotesController],
  providers: [CreditNotesService],
  exports: [CreditNotesService, MongooseModule],
})
export class CreditNotesModule {}
