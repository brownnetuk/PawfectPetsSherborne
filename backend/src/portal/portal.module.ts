import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import {
  DayBooking,
  DayBookingSchema,
} from '../day-bookings/schemas/day-booking.schema';
import { CustomersModule } from '../customers/customers.module';
import { AnimalsModule } from '../animals/animals.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { QuotesModule } from '../quotes/quotes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { MessagesModule } from '../messages/messages.module';
import { SettingsModule } from '../settings/settings.module';
import { PortalController } from './portal.controller';
import { PortalAdminController } from './portal-admin.controller';
import { PortalService } from './portal.service';
import { PortalJwtStrategy } from './portal-jwt.strategy';

// The customer-facing portal: its own auth realm (PortalJwtStrategy signs/
// verifies with a secret derived from JWT_SECRET) living alongside staff auth.
// Reuses existing services for the data endpoints (invoices/quotes/customer
// edits) and reads DayBooking directly for the customer's schedule.
@Module({
  imports: [
    // CustomersModule re-exports the Customer model (MongooseModule) plus
    // CustomersService, so no separate forFeature for Customer is needed.
    CustomersModule,
    AnimalsModule,
    InvoicesModule,
    QuotesModule,
    NotificationsModule,
    PushModule,
    MessagesModule,
    SettingsModule,
    MongooseModule.forFeature([
      { name: DayBooking.name, schema: DayBookingSchema },
    ]),
    PassportModule,
    // Registered empty — tokens are signed per-call with the derived portal
    // secret (see PortalService.sign).
    JwtModule.register({}),
  ],
  controllers: [PortalController, PortalAdminController],
  providers: [PortalService, PortalJwtStrategy],
})
export class PortalModule {}
