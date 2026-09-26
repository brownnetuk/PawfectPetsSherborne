import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { Staff, StaffSchema } from '../staff/schemas/staff.schema';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { Policy, PolicySchema } from './schemas/policy.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Policy.name, schema: PolicySchema },
      // Read-only here, for snapshotting the active staff list onto each
      // published version's sign-off rows -- registered directly rather
      // than importing StaffModule, same "declare your own copy" convention
      // used elsewhere.
      { name: Staff.name, schema: StaffSchema },
    ]),
    // For notifyDueReviews()/sendReminder()'s admin-feed + push notifications.
    NotificationsModule,
  ],
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
