import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { Message, MessageSchema } from './schemas/message.schema';

// Staff <-> customer messaging. Exports MessagesService so the customer realm
// (PortalModule) can add its own /portal/messages endpoints on top.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    CustomersModule, // Customer model, for names and existence checks
    PushModule, // push (via CustomerNotifications) + staff push
    CustomerNotificationsModule, // record + push a staff message to the customer
    NotificationsModule, // notify staff on a customer message
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
