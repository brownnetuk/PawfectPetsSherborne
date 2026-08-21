import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethod, PaymentMethodSchema } from './schemas/payment-method.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: PaymentMethod.name, schema: PaymentMethodSchema }])],
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
