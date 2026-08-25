import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
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
    ]),
    SettingsModule,
    AuditLogModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService, MongooseModule],
})
export class QuotesModule {}
