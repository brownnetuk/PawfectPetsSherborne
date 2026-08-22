import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { EncryptionModule } from './common/encryption/encryption.module';
import { CustomersModule } from './customers/customers.module';
import { AnimalsModule } from './animals/animals.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { BookingsModule } from './bookings/bookings.module';
import { CreditNotesModule } from './credit-notes/credit-notes.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InvoicesModule } from './invoices/invoices.module';
import { QuotesModule } from './quotes/quotes.module';
import { InvoiceTermsModule } from './invoice-terms/invoice-terms.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { CrmModule } from './crm/crm.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { EnquiriesModule } from './enquiries/enquiries.module';
import { VendorsModule } from './vendors/vendors.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/pawfectpets',
        ),
      }),
    }),
    EncryptionModule,
    AuthModule,
    AuditLogModule,
    CustomersModule,
    AnimalsModule,
    BankAccountsModule,
    BookingsModule,
    InvoicesModule,
    QuotesModule,
    InvoiceTermsModule,
    PaymentMethodsModule,
    PaymentsModule,
    ProductsModule,
    CrmModule,
    SettingsModule,
    EnquiriesModule,
    ExpensesModule,
    ExpenseCategoriesModule,
    CreditNotesModule,
    ReportsModule,
    VendorsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
