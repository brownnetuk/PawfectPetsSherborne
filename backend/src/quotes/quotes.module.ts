import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { InvoiceTerm, InvoiceTermSchema } from '../invoice-terms/schemas/invoice-term.schema';
import { InvoicesModule } from '../invoices/invoices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  BusinessInfo,
  BusinessInfoSchema,
} from '../settings/schemas/business-info.schema';
import { SettingsModule } from '../settings/settings.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { Quote, QuoteSchema } from './schemas/quote.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quote.name, schema: QuoteSchema },
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
      // Registered here too (not just CustomersModule) so QuotesService can
      // resolve-or-create a real Customer when a manual-customer quote is
      // accepted, without importing CustomersModule -- which already imports
      // QuotesModule (for its own delete-guard checks) and would circularize.
      { name: Customer.name, schema: CustomerSchema },
      // Read-only, so acceptAndConvert() can look up the default term's
      // due-date rule without importing InvoiceTermsModule (which exports
      // nothing today) just for that.
      { name: InvoiceTerm.name, schema: InvoiceTermSchema },
    ]),
    SettingsModule,
    AuditLogModule,
    // For InvoicesService -- a quote accepted on its public page is turned
    // into a real Invoice (see QuotesService.acceptAndConvert()). Safe
    // direction: InvoicesModule doesn't import QuotesModule.
    InvoicesModule,
    // For pushing the customer's portal app when a quote is emailed to them.
    NotificationsModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService, MongooseModule],
})
export class QuotesModule {}
