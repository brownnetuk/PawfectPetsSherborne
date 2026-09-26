import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateEmailGroupDto } from './dto/create-email-group.dto';
import { UpdateEmailGroupDto } from './dto/update-email-group.dto';
import { EmailGroup } from './schemas/email-group.schema';

const POPULATE = { path: 'customers', select: 'name email' };

@Injectable()
export class EmailGroupsService {
  constructor(@InjectModel(EmailGroup.name) private readonly emailGroupModel: Model<EmailGroup>) {}

  findAll(): Promise<EmailGroup[]> {
    return this.emailGroupModel.find().sort({ name: 1 }).populate(POPULATE).exec();
  }

  async findOne(id: string): Promise<EmailGroup> {
    const group = await this.emailGroupModel.findById(id).populate(POPULATE).exec();
    if (!group) {
      throw new NotFoundException(`Email group ${id} not found`);
    }
    return group;
  }

  async create(dto: CreateEmailGroupDto): Promise<EmailGroup> {
    try {
      const created = await new this.emailGroupModel({
        name: dto.name,
        customers: dto.customers ?? [],
      }).save();
      return created.populate(POPULATE);
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(`A group named "${dto.name}" already exists.`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateEmailGroupDto): Promise<EmailGroup> {
    const group = await this.emailGroupModel.findById(id).exec();
    if (!group) {
      throw new NotFoundException(`Email group ${id} not found`);
    }
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.customers !== undefined) group.customers = dto.customers as unknown as EmailGroup['customers'];
    try {
      await group.save();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(`A group named "${dto.name}" already exists.`);
      }
      throw err;
    }
    return group.populate(POPULATE);
  }

  async remove(id: string): Promise<void> {
    const result = await this.emailGroupModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Email group ${id} not found`);
    }
  }
}
