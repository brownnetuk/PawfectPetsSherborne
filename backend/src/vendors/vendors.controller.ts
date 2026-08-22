import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { VendorsService } from './vendors.service';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  create(@Body() dto: CreateVendorDto) {
    return this.vendorsService.create(dto);
  }

  @Get()
  findAll() {
    return this.vendorsService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateVendorDto) {
    return this.vendorsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vendorsService.remove(id);
  }
}
