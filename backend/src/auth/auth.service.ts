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
import { Model } from 'mongoose';
import { Staff } from '../staff/schemas/staff.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
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
    }).save();
    return { id: staff._id, name: staff.name, email: staff.email };
  }

  async login(dto: LoginDto) {
    const staff = await this.staffModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (!staff) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const passwordMatches = await bcrypt.compare(dto.password, staff.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: staff._id.toString(), email: staff.email, name: staff.name };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      staff: { id: staff._id, name: staff.name, email: staff.email },
    };
  }

  async listStaff() {
    const staff = await this.staffModel.find().select('name email createdAt').sort({ name: 1 }).exec();
    return staff.map((s) => ({ id: s._id, name: s.name, email: s.email }));
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
