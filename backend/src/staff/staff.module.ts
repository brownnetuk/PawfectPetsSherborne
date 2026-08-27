import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import { Staff, StaffSchema } from './schemas/staff.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Staff.name, schema: StaffSchema },
      // Read-only here, purely so Staff.role can be populated -- same
      // register-directly-to-avoid-a-circular-module-import pattern already
      // used elsewhere (e.g. Customer in QuotesModule).
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class StaffModule {}
