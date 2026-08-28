import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VetPractice, VetPracticeSchema } from './schemas/vet-practice.schema';
import { VetPracticesController } from './vet-practices.controller';
import { VetPracticesService } from './vet-practices.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VetPractice.name, schema: VetPracticeSchema }]),
  ],
  controllers: [VetPracticesController],
  providers: [VetPracticesService],
})
export class VetPracticesModule {}
