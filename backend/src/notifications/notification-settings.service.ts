import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { NotificationSettings } from './schemas/notification-settings.schema';

@Injectable()
export class NotificationSettingsService {
  constructor(
    @InjectModel(NotificationSettings.name)
    private readonly model: Model<NotificationSettings>,
  ) {}

  // The single settings doc, created with defaults on first access.
  async get(): Promise<NotificationSettings> {
    const existing = await this.model.findOne().exec();
    if (existing) return existing;
    return this.model.create({});
  }

  async update(dto: UpdateNotificationSettingsDto): Promise<NotificationSettings> {
    const current = await this.get();
    Object.assign(current, dto);
    return current.save();
  }

  // Records the date a digest was sent so the cron only fires once per day.
  async markDigestSent(dateKey: string): Promise<void> {
    await this.model.updateOne({ _id: (await this.get())._id }, { lastDigestSentOn: dateKey }).exec();
  }
}
