import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import sharp from 'sharp';
import { CreateCrmActivityDto } from './dto/create-crm-activity.dto';
import { UpdateCrmActivityDto } from './dto/update-crm-activity.dto';
import { CrmActivity } from './schemas/crm-activity.schema';

@Injectable()
export class CrmService implements OnModuleInit {
  constructor(
    @InjectModel(CrmActivity.name) private readonly activityModel: Model<CrmActivity>,
  ) {}

  onModuleInit() {
    // Fire-and-forget -- boot must never wait on it.
    void this.compressLegacyAttachments();
  }

  /**
   * One-off recompression of note attachments saved before the apps started
   * compressing uploads (the admin used to store raw multi-MB photos, which
   * is what made those notes slow to open on the phone). Any attachment over
   * 250 KB is downscaled to 1200px JPEG q60 -- the same target the apps now
   * upload at -- and the note is flagged so it's never rescanned. Idempotent
   * and per-note, so an interrupted run just resumes on the next boot.
   */
  private async compressLegacyAttachments(): Promise<void> {
    try {
      const candidates = await this.activityModel
        .find({ attachmentCount: { $gt: 0 }, attachmentsCompressed: { $ne: true } })
        .select('attachments')
        .exec();
      let shrunk = 0;
      for (const doc of candidates) {
        const next: string[] = [];
        for (const att of doc.attachments ?? []) {
          const match = /^data:image\/[\w+.-]+;base64,(.+)$/s.exec(att);
          const input = match ? Buffer.from(match[1], 'base64') : null;
          if (!input || input.length <= 250 * 1024) {
            next.push(att);
            continue;
          }
          try {
            const out = await sharp(input)
              .rotate() // bake in EXIF orientation before it's lost with the metadata
              .resize({ width: 1200, withoutEnlargement: true })
              .jpeg({ quality: 60 })
              .toBuffer();
            next.push(out.length < input.length ? `data:image/jpeg;base64,${out.toString('base64')}` : att);
            if (out.length < input.length) shrunk++;
          } catch {
            next.push(att); // not decodable -- leave it be
          }
        }
        await this.activityModel
          .updateOne({ _id: doc._id }, { attachments: next, attachmentsCompressed: true })
          .exec();
      }
      if (candidates.length > 0) {
        console.log(`CRM attachments: checked ${candidates.length} legacy note(s), recompressed ${shrunk} image(s).`);
      }
    } catch (err) {
      console.error('CRM attachment recompression failed (will retry next boot):', err);
    }
  }

  create(dto: CreateCrmActivityDto): Promise<CrmActivity> {
    return new this.activityModel({
      ...dto,
      attachmentCount: dto.attachments?.length ?? 0,
      // The apps compress before uploading now, so new notes never need the
      // legacy migration pass above.
      attachmentsCompressed: true,
    }).save();
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
      update.attachmentsCompressed = true;
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
