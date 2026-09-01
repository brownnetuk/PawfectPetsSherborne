import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Appointment, AppointmentSchema } from '../appointments/schemas/appointment.schema';
import { DayBooking, DayBookingSchema } from '../day-bookings/schemas/day-booking.schema';
import { PushModule } from '../push/push.module';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationService } from './notification.service';
import { NotificationSettings, NotificationSettingsSchema } from './schemas/notification-settings.schema';

@Module({
  imports: [
    PushModule,
    MongooseModule.forFeature([
      { name: NotificationSettings.name, schema: NotificationSettingsSchema },
      { name: DayBooking.name, schema: DayBookingSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService, NotificationService],
  exports: [NotificationSettingsService, NotificationService],
})
export class NotificationsModule {}
