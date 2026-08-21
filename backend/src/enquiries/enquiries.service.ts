import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { Enquiry } from './schemas/enquiry.schema';

@Injectable()
export class EnquiriesService {
  constructor(@InjectModel(Enquiry.name) private readonly enquiryModel: Model<Enquiry>) {}

  create(dto: CreateEnquiryDto): Promise<Enquiry> {
    return new this.enquiryModel(dto).save();
  }

  findAll(): Promise<Enquiry[]> {
    return this.enquiryModel.find().sort({ createdAt: -1 }).exec();
  }

  async remove(id: string): Promise<void> {
    const result = await this.enquiryModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Enquiry ${id} not found`);
    }
  }
}
