import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { Vendor } from './schemas/vendor.schema';

@Injectable()
export class VendorsService {
  constructor(
    @InjectModel(Vendor.name) private readonly vendorModel: Model<Vendor>,
  ) {}

  create(dto: CreateVendorDto): Promise<Vendor> {
    return new this.vendorModel(dto).save();
  }

  findAll(): Promise<Vendor[]> {
    return this.vendorModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: CreateVendorDto): Promise<Vendor> {
    const vendor = await this.vendorModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!vendor) {
      throw new NotFoundException(`Vendor ${id} not found`);
    }
    return vendor;
  }

  async remove(id: string): Promise<void> {
    const result = await this.vendorModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Vendor ${id} not found`);
    }
  }
}
