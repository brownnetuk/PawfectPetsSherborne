import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCrmActivityDto } from './dto/create-crm-activity.dto';
import { UpdateCrmActivityDto } from './dto/update-crm-activity.dto';
import { CrmActivity } from './schemas/crm-activity.schema';

@Injectable()
export class CrmService {
  constructor(
    @InjectModel(CrmActivity.name) private readonly activityModel: Model<CrmActivity>,
  ) {}

  create(dto: CreateCrmActivityDto): Promise<CrmActivity> {
    return new this.activityModel({ ...dto, attachmentCount: dto.attachments?.length ?? 0 }).save();
  }

  // Attachment payloads (base64 images) are excluded here so note lists stay
  // light -- attachmentCount still says which notes carry them, and findOne()
  // returns them in full when a single note is opened.
  findAll(customerId?: string): Promise<CrmActivity[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.activityModel
      .find(filter)
      .select('-attachments')
      .sort({ createdAt: -1 })
      .populate('customer', 'name email')
      .exec();
  }

  async findOne(id: string): Promise<CrmActivity> {
    const activity = await this.activityModel
      .findById(id)
      .populate('customer', 'name email')
      .exec();
    if (!activity) {
      throw new NotFoundException(`CRM activity ${id} not found`);
    }
    return activity;
  }

  async update(id: string, dto: UpdateCrmActivityDto): Promise<CrmActivity> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.attachments !== undefined) {
      update.attachmentCount = dto.attachments?.length ?? 0;
    }
    const activity = await this.activityModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('customer', 'name email')
      .exec();
    if (!activity) {
      throw new NotFoundException(`CRM activity ${id} not found`);
    }
    return activity;
  }

  async remove(id: string): Promise<void> {
    const result = await this.activityModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`CRM activity ${id} not found`);
    }
  }
}
