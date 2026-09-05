import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Appointment, AppointmentSchema } from '../appointments/schemas/appointment.schema';
import { DayBooking, DayBookingSchema } from '../day-bookings/schemas/day-booking.schema';
import { PushModule } from '../push/push.module';
import { CustomerNotificationsModule } from '../customer-notifications/customer-notifications.module';
import { NotificationFeedController } from './notification-feed.controller';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationService } from './notification.service';
import { NotificationItem, NotificationItemSchema } from './schemas/notification-item.schema';
import { NotificationSettings, NotificationSettingsSchema } from './schemas/notification-settings.schema';

@Module({
  imports: [
    PushModule,
    CustomerNotificationsModule,
    MongooseModule.forFeature([
      { name: NotificationSettings.name, schema: NotificationSettingsSchema },
      { name: NotificationItem.name, schema: NotificationItemSchema },
      { name: DayBooking.name, schema: DayBookingSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [NotificationSettingsController, NotificationFeedController],
  providers: [NotificationSettingsService, NotificationService],
  exports: [NotificationSettingsService, NotificationService],
})
export class NotificationsModule {}
