import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { EnquiriesService } from './enquiries.service';

@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly enquiriesService: EnquiriesService) {}

  @Post()
  create(@Body() dto: CreateEnquiryDto) {
    return this.enquiriesService.create(dto);
  }

  @Get()
  findAll() {
    return this.enquiriesService.findAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.enquiriesService.remove(id);
  }
}
