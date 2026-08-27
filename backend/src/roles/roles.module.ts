import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Staff, StaffSchema } from '../staff/schemas/staff.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      // Read-only here -- RolesService.remove() checks whether any Staff
      // still references a role before deleting it, same pattern as Role
      // being read-only-registered in StaffModule for the reverse populate.
      { name: Staff.name, schema: StaffSchema },
    ]),
  ],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
