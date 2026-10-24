import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { RecycleBinController } from './recycle-bin.controller';
import { RecycleBinService } from './recycle-bin.service';
import {
  RecycleBinEntry,
  RecycleBinEntrySchema,
} from './schemas/recycle-bin-entry.schema';
import {
  RecycleBinItem,
  RecycleBinItemSchema,
} from './schemas/recycle-bin-item.schema';

// What gets *into* the bin is recycleBinPlugin (registered on the
// connection in app.module.ts) plus recycleBinContextMiddleware (main.ts);
// this module is just the Settings > Recycle Bin list, restore and
// permanent delete.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RecycleBinEntry.name, schema: RecycleBinEntrySchema },
      { name: RecycleBinItem.name, schema: RecycleBinItemSchema },
    ]),
    InvoicesModule,
    BankAccountsModule,
  ],
  controllers: [RecycleBinController],
  providers: [RecycleBinService],
})
export class RecycleBinModule {}
