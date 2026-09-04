import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { getClientIp } from '../common/client-ip.util';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { Staff } from '../staff/schemas/staff.schema';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

type PopulatedRole = { _id: unknown; name: string; permissions: string[] } | null;

function shapeStaff(staff: Omit<Staff, 'role'> & { role: PopulatedRole }) {
  return {
    id: staff._id,
    name: staff.name,
    username: staff.username,
    email: staff.email,
    isBreakGlass: staff.isBreakGlass ?? false,
    locked: staff.locked ?? false,
    role: staff.role ? { id: staff.role._id, name: staff.role.name, permissions: staff.role.permissions } : null,
  };
}

// Sent by the admin web app on every request (admin/src/api/client.ts) -- the
// mobile app never sends this, so it's naturally exempt from the IP check
// below without needing its own opt-out.
const ADMIN_CLIENT_HEADER = 'x-client-app';
const ADMIN_CLIENT_VALUE = 'admin';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly jwtService: JwtService,
  ) {}

  // One-time backfill for accounts created before `username` existed --
  // defaults it to the account's (already-unique) email, matching what
  // people are used to logging in with, so nothing breaks until someone
  // deliberately changes it. Re-checks every boot but is a no-op once every
  // account has a username (same $exists-scan idiom as other seed/backfill
  // steps in this codebase, e.g. RolesService's seeded "Admin" role).
  async onModuleInit() {
    const missing = await this.staffModel.find({ username: { $exists: false } }).exec();
    for (const staff of missing) {
      await this.staffModel.updateOne({ _id: staff._id }, { username: staff.email }).exec();
    }
  }

  async register(dto: RegisterDto) {
    const existingEmail = await this.staffModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (existingEmail) {
      throw new ConflictException('A staff account with that email already exists');
    }
    const existingUsername = await this.staffModel
      .findOne({ username: dto.username.toLowerCase() })
      .exec();
    if (existingUsername) {
      throw new ConflictException('A staff account with that username already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const staff = await new this.staffModel({
      name: dto.name,
      username: dto.username.toLowerCase(),
      email: dto.email.toLowerCase(),
      passwordHash,
      isBreakGlass: dto.isBreakGlass ?? false,
      role: dto.role,
    }).save();
    // role is unpopulated (just an ObjectId) fresh off save() -- re-fetch
    // populated so the response shape matches every other staff response.
    const populated = await this.staffModel
      .findById(staff._id)
      .populate<{ role: PopulatedRole }>('role', 'name permissions')
      .exec();
    return shapeStaff(populated!);
  }

  async login(dto: LoginDto, req: Request) {
    const staff = await this.staffModel.findOne({ username: dto.username.toLowerCase() }).exec();
    if (!staff) {
      throw new UnauthorizedException('Invalid username or password');
    }
    const passwordMatches = await bcrypt.compare(dto.password, staff.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Checked after the password (so a wrong-password attempt on a locked
    // account doesn't reveal that it's locked), and unconditionally --
    // unlike the trusted-IP check below, break-glass does NOT exempt this:
    // locking an account is a deliberate action by another staff member, not
    // a stale-config problem break-glass exists to work around.
    if (staff.locked) {
      throw new UnauthorizedException('This account has been locked. Ask another staff member to unlock it.');
    }

    // Only applies to the admin web app (see ADMIN_CLIENT_HEADER), only when
    // staff have actually populated Business Info > Trusted IPs (an empty
    // list means unrestricted, so this can never lock anyone out until it's
    // deliberately configured), and never to a break-glass account -- that's
    // the whole point of one: a way back in if the trusted-IP list is wrong
    // or stale and everyone else is locked out. Checked after the password,
    // not before, since knowing isBreakGlass requires already having found
    // this specific staff record.
    if (req.headers[ADMIN_CLIENT_HEADER] === ADMIN_CLIENT_VALUE && !staff.isBreakGlass) {
      const businessInfo = await this.businessInfoModel.findOne().select('trustedIps').exec();
      const trustedIps = businessInfo?.trustedIps ?? [];
      if (trustedIps.length > 0) {
        const clientIp = getClientIp(req);
        if (!clientIp || !trustedIps.includes(clientIp)) {
          throw new UnauthorizedException(
            `Login blocked: this device's IP address${clientIp ? ` (${clientIp})` : ''} is not on the admin Trusted IPs list.`,
          );
        }
      }
    }

    const payload = { sub: staff._id.toString(), email: staff.email, name: staff.name };
    return {
      // "Remember me" swaps the default 12h expiry for 30 days.
      accessToken: await this.jwtService.signAsync(
        payload,
        dto.rememberMe ? { expiresIn: '30d' } : {},
      ),
      staff: { id: staff._id, name: staff.name, email: staff.email },
    };
  }

  async listStaff() {
    const staff = await this.staffModel
      .find()
      .select('name username email isBreakGlass locked role createdAt')
      .populate<{ role: PopulatedRole }>('role', 'name permissions')
      .sort({ name: 1 })
      .exec();
    return staff.map((s) => shapeStaff(s));
  }

  async deleteStaff(id: string) {
    const count = await this.staffModel.countDocuments().exec();
    if (count <= 1) {
      throw new BadRequestException('Cannot delete the last remaining staff account');
    }
    const result = await this.staffModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Staff ${id} not found`);
    }
  }

  // Backs both the Edit Staff modal (name/username/email/isBreakGlass/locked)
  // and the Role dropdown's immediate-save (role only) -- every field is
  // optional so either caller only sends what it actually changed.
  async updateStaff(id: string, dto: UpdateStaffDto) {
    if (dto.email !== undefined) {
      const existing = await this.staffModel
        .findOne({ email: dto.email.toLowerCase(), _id: { $ne: id } })
        .exec();
      if (existing) {
        throw new ConflictException('A staff account with that email already exists');
      }
    }
    if (dto.username !== undefined) {
      const existing = await this.staffModel
        .findOne({ username: dto.username.toLowerCase(), _id: { $ne: id } })
        .exec();
      if (existing) {
        throw new ConflictException('A staff account with that username already exists');
      }
    }
    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.username !== undefined) set.username = dto.username.toLowerCase();
    if (dto.email !== undefined) set.email = dto.email.toLowerCase();
    if (dto.isBreakGlass !== undefined) set.isBreakGlass = dto.isBreakGlass;
    if (dto.locked !== undefined) set.locked = dto.locked;
    // Explicit null unassigns the role (full access) -- $unset, not $set,
    // since a plain $set: { role: null } would leave the field
    // present-but-null rather than genuinely absent, and PermissionsGuard
    // checks presence.
    const mongoUpdate =
      dto.role === null
        ? { $set: set, $unset: { role: '' } }
        : dto.role !== undefined
          ? { $set: { ...set, role: dto.role } }
          : { $set: set };
    const staff = await this.staffModel
      .findByIdAndUpdate(id, mongoUpdate, { new: true })
      .populate<{ role: PopulatedRole }>('role', 'name permissions')
      .exec();
    if (!staff) {
      throw new NotFoundException(`Staff ${id} not found`);
    }
    return shapeStaff(staff);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const result = await this.staffModel.updateOne({ _id: id }, { passwordHash }).exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Staff ${id} not found`);
    }
  }
}
