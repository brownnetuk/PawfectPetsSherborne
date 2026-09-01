import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import {
  CreditNote,
  CreditNoteSchema,
} from '../credit-notes/schemas/credit-note.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import {
  BusinessInfo,
  BusinessInfoSchema,
} from '../settings/schemas/business-info.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { Invoice, InvoiceSchema } from './schemas/invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
      // Read-only, for InvoicesService.remove()'s delete guard -- registered
      // directly (not by importing PaymentsModule/CreditNotesModule) since
      // both of those already import InvoicesModule the other way round.
      { name: Payment.name, schema: PaymentSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
    ]),
    SettingsModule,
    AuditLogModule,
    NotificationsModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService, MongooseModule],
})
export class InvoicesModule {}
