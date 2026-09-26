import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { EmailGroupsModule } from '../email-groups/email-groups.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailMessagesController } from './email-messages.controller';
import { EmailMessagesService } from './email-messages.service';
import { EmailMessage, EmailMessageSchema } from './schemas/email-message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailMessage.name, schema: EmailMessageSchema },
      // Read-only here, for resolving recipients by id -- registered directly
      // rather than importing CustomersModule (which sits upstream of most of
      // the app), same "declare your own copy" convention used elsewhere.
      { name: Customer.name, schema: CustomerSchema },
    ]),
    // For expanding a group's saved customer ids into the send list.
    EmailGroupsModule,
    // For SettingsService.sendTemplatedEmail() (the "Generic Email" template).
    SettingsModule,
  ],
  controllers: [EmailMessagesController],
  providers: [EmailMessagesService],
  exports: [EmailMessagesService],
})
export class EmailMessagesModule {}
