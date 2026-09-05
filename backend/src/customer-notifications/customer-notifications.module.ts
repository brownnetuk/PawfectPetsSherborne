import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushModule } from '../push/push.module';
import { CustomerNotificationsService } from './customer-notifications.service';
import {
  CustomerNotification,
  CustomerNotificationSchema,
} from './schemas/customer-notification.schema';

// Persists + pushes customer-facing notifications (the customer app's bell
// feed). Exported so NotificationService, MessagesService and PortalService can
// record through it.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerNotification.name, schema: CustomerNotificationSchema },
    ]),
    PushModule,
  ],
  providers: [CustomerNotificationsService],
  exports: [CustomerNotificationsService],
})
export class CustomerNotificationsModule {}
