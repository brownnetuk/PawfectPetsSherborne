import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AnnualLeaveModule } from './annual-leave/annual-leave.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { EncryptionModule } from './common/encryption/encryption.module';
import { CustomersModule } from './customers/customers.module';
import { AnimalsModule } from './animals/animals.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { BankHolidaysModule } from './bank-holidays/bank-holidays.module';
import { BankTransfersModule } from './bank-transfers/bank-transfers.module';
import { BookingsModule } from './bookings/bookings.module';
import { DayBookingsModule } from './day-bookings/day-bookings.module';
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
import { VetPracticesModule } from './vet-practices/vet-practices.module';
import { FormsModule } from './forms/forms.module';
import { FormSubmissionsModule } from './form-submissions/form-submissions.module';
import { RolesModule } from './roles/roles.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
    AppointmentsModule,
    AuditLogModule,
    CustomersModule,
    AnimalsModule,
    BankAccountsModule,
    BankHolidaysModule,
    AnnualLeaveModule,
    BankTransfersModule,
    BookingsModule,
    DayBookingsModule,
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
    VetPracticesModule,
    FormsModule,
    FormSubmissionsModule,
    RolesModule,
    // Needed here (not just via AuthModule) so PermissionsGuard below --
    // provided at this module's level -- can inject the Staff model.
    StaffModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Runs after JwtAuthGuard; a no-op on any route without
    // @RequirePermission() (see permissions.guard.ts).
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
