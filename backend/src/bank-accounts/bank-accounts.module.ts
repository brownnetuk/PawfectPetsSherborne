import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditNote, CreditNoteSchema } from '../credit-notes/schemas/credit-note.schema';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccount, BankAccountSchema } from './schemas/bank-account.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BankAccount.name, schema: BankAccountSchema },
      // Read-only here -- BankAccountsService.getTransactions() reads these
      // three directly to build a per-account statement, the same
      // declare-your-own-forFeature-instead-of-importing-the-module approach
      // ReportsModule uses, which also avoids a real circular module
      // dependency (Payments/Expenses/CreditNotes all import
      // BankAccountsModule the other way, for adjustBalance()).
      { name: Payment.name, schema: PaymentSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
    ]),
  ],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
