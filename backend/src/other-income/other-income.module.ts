import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { OtherIncomeController } from './other-income.controller';
import { OtherIncomeService } from './other-income.service';
import { OtherIncome, OtherIncomeSchema } from './schemas/other-income.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OtherIncome.name, schema: OtherIncomeSchema }]),
    BankAccountsModule,
  ],
  controllers: [OtherIncomeController],
  providers: [OtherIncomeService],
})
export class OtherIncomeModule {}
