import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { describeBlockers } from '../common/delete-guard.util';
import { ALL_PERMISSION_KEYS } from '../auth/permissions.catalog';
import { Staff } from '../staff/schemas/staff.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { Role } from './schemas/role.schema';

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
  ) {}

  // Seeds a single "Admin" role (every permission) once, on boot -- same
  // seed-on-init pattern as FormsService's "Customer Intake" form: an atomic
  // upsert ($setOnInsert) so it only ever inserts when missing, never
  // overwrites a since-edited/renamed copy. Ensures there's always at least
  // one usable role to assign, even on a fresh database.
  async onModuleInit(): Promise<void> {
    await this.roleModel
      .findOneAndUpdate(
        { name: 'Admin' },
        { $setOnInsert: { name: 'Admin', permissions: ALL_PERMISSION_KEYS } },
        { upsert: true },
      )
      .exec();
  }

  // Shaped to { id, name, permissions } rather than returning the raw
  // document (which only carries _id) -- matches how AuthService embeds a
  // staff member's role the same way, so admin/src/types.ts's Role.id is
  // consistent everywhere it's used.
  private shape(role: Role) {
    return { id: role._id, name: role.name, permissions: role.permissions };
  }

  async create(dto: CreateRoleDto) {
    const role = await new this.roleModel(dto).save();
    return this.shape(role);
  }

  async findAll() {
    const roles = await this.roleModel.find().sort({ name: 1 }).exec();
    return roles.map((r) => this.shape(r));
  }

  async update(id: string, dto: CreateRoleDto) {
    const role = await this.roleModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return this.shape(role);
  }

  async remove(id: string): Promise<void> {
    const staffCount = await this.staffModel.countDocuments({ role: id }).exec();
    const blockers = describeBlockers({ 'staff account': staffCount });
    if (blockers) {
      throw new ConflictException(
        `Can't delete this role: it's still assigned to ${blockers}. Reassign them first.`,
      );
    }
    const result = await this.roleModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Role ${id} not found`);
    }
  }
}
