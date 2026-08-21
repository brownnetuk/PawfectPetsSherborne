import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoiceTermsController } from './invoice-terms.controller';
import { InvoiceTermsService } from './invoice-terms.service';
import { InvoiceTerm, InvoiceTermSchema } from './schemas/invoice-term.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: InvoiceTerm.name, schema: InvoiceTermSchema }])],
  controllers: [InvoiceTermsController],
  providers: [InvoiceTermsService],
})
export class InvoiceTermsModule {}
