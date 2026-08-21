import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccount, BankAccountSchema } from './schemas/bank-account.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: BankAccount.name, schema: BankAccountSchema }])],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
})
export class BankAccountsModule {}
