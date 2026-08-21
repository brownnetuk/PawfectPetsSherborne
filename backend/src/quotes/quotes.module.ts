import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessInfo, BusinessInfoSchema } from '../settings/schemas/business-info.schema';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { Quote, QuoteSchema } from './schemas/quote.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quote.name, schema: QuoteSchema },
      { name: BusinessInfo.name, schema: BusinessInfoSchema },
    ]),
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService, MongooseModule],
})
export class QuotesModule {}
