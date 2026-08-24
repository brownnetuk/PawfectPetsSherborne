import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

// Sent by the admin web app on every request (admin/src/api/client.ts) -- the
// mobile app never sends this, so it's naturally exempt from the IP check
// below without needing its own opt-out.
const ADMIN_CLIENT_HEADER = 'x-client-app';
const ADMIN_CLIENT_VALUE = 'admin';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.staffModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (existing) {
      throw new ConflictException('A staff account with that email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const staff = await new this.staffModel({
      name: dto.name,
      email: dto.email.toLowerCase(),
      passwordHash,
      isBreakGlass: dto.isBreakGlass ?? false,
    }).save();
    return { id: staff._id, name: staff.name, email: staff.email, isBreakGlass: staff.isBreakGlass ?? false };
  }

  async login(dto: LoginDto, req: Request) {
    const staff = await this.staffModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (!staff) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const passwordMatches = await bcrypt.compare(dto.password, staff.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
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
      accessToken: await this.jwtService.signAsync(payload),
      staff: { id: staff._id, name: staff.name, email: staff.email },
    };
  }

  async listStaff() {
    const staff = await this.staffModel
      .find()
      .select('name email isBreakGlass createdAt')
      .sort({ name: 1 })
      .exec();
    return staff.map((s) => ({ id: s._id, name: s.name, email: s.email, isBreakGlass: s.isBreakGlass ?? false }));
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
}
