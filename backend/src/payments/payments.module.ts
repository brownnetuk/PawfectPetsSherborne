import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { InvoicesModule } from '../invoices/invoices.module';
import {
  BusinessInfo,
  BusinessInfoSchema,
} from '../settings/schemas/business-info.schema';
import { SettingsModule } from '../settings/settings.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment, PaymentSchema } from './schemas/payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
    ]),
    // Needed so PaymentsService can deduct/reverse a payment's amount against
    // the invoice it's recorded on (see InvoicesService.applyPayment/reversePayment).
    InvoicesModule,
    AuditLogModule,
    BankAccountsModule,
    ExpensesModule,
    SettingsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
