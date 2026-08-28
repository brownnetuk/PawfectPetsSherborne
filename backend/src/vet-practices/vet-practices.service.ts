import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateVetPracticeDto } from './dto/create-vet-practice.dto';
import { VetPractice } from './schemas/vet-practice.schema';

@Injectable()
export class VetPracticesService {
  constructor(
    @InjectModel(VetPractice.name) private readonly vetPracticeModel: Model<VetPractice>,
  ) {}

  create(dto: CreateVetPracticeDto): Promise<VetPractice> {
    return new this.vetPracticeModel(dto).save();
  }

  findAll(): Promise<VetPractice[]> {
    return this.vetPracticeModel.find().sort({ practiceName: 1 }).exec();
  }

  async update(id: string, dto: CreateVetPracticeDto): Promise<VetPractice> {
    const practice = await this.vetPracticeModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!practice) {
      throw new NotFoundException(`Vet practice ${id} not found`);
    }
    return practice;
  }

  async remove(id: string): Promise<void> {
    const result = await this.vetPracticeModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Vet practice ${id} not found`);
    }
  }
}
