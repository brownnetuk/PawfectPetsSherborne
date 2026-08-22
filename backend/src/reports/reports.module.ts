import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditNote, CreditNoteSchema } from '../credit-notes/schemas/credit-note.schema';
import { Expense, ExpenseSchema } from '../expenses/schemas/expense.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// Read-only aggregation across three other modules' collections -- declares
// its own MongooseModule.forFeature() rather than importing
// Payments/CreditNotes/ExpensesModule and their services, since it never
// mutates anything and doesn't need their business logic, only their models.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
      { name: Expense.name, schema: ExpenseSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
