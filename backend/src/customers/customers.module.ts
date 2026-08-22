import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnimalsModule } from '../animals/animals.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CrmModule } from '../crm/crm.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { QuotesModule } from '../quotes/quotes.module';
import { SettingsModule } from '../settings/settings.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customer, CustomerSchema } from './schemas/customer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
    ]),
    // Needed so CustomersService can check for Animals/Bookings/Invoices/Quotes/CRM
    // activity referencing a customer before deleting it.
    AnimalsModule,
    BookingsModule,
    InvoicesModule,
    QuotesModule,
    CrmModule,
    AuditLogModule,
    SettingsModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService, MongooseModule],
})
export class CustomersModule {}
