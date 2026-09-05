import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushModule } from '../push/push.module';
import { PushMessagesController } from './push-messages.controller';
import { PushMessagesService } from './push-messages.service';
import { PushMessage, PushMessageSchema } from './schemas/push-message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PushMessage.name, schema: PushMessageSchema }]),
    PushModule,
  ],
  controllers: [PushMessagesController],
  providers: [PushMessagesService],
  exports: [PushMessagesService],
})
export class PushMessagesModule {}
