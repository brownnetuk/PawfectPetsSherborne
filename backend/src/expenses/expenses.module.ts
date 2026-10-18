import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { BusinessInfo, BusinessInfoSchema } from '../settings/schemas/business-info.schema';
import { SettingsModule } from '../settings/settings.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { Expense, ExpenseSchema } from './schemas/expense.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      // Read/increment only, for the EXP{n} counter -- registered directly
      // rather than importing it from SettingsModule, same "declare your own
      // copy" convention RiskAssessmentsModule/PoliciesModule use.
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
    ]),
    BankAccountsModule,
    // For sendReceiptEmail()'s SettingsService.sendDirectEmail() call.
    SettingsModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService, MongooseModule],
})
export class ExpensesModule {}
