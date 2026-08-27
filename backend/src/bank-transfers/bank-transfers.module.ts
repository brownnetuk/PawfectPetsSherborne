import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { BankTransfersController } from './bank-transfers.controller';
import { BankTransfersService } from './bank-transfers.service';
import { BankTransfer, BankTransferSchema } from './schemas/bank-transfer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BankTransfer.name, schema: BankTransferSchema }]),
    BankAccountsModule,
  ],
  controllers: [BankTransfersController],
  providers: [BankTransfersService],
})
export class BankTransfersModule {}
