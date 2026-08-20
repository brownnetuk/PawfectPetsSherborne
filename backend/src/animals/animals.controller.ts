import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { AnimalsService } from './animals.service';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';

@Controller('animals')
export class AnimalsController {
  constructor(private readonly animalsService: AnimalsService) {}

  // Public: the intake form creates one Animal per pet on submit.
  @Public()
  @Post()
  create(@Body() dto: CreateAnimalDto) {
    return this.animalsService.create(dto);
  }

  @Get()
  findAll(@Query('customer') customer?: string) {
    return this.animalsService.findAll(customer);
  }

  // Public: lets the intake form check "does this customer already have pets on
  // file" (to skip re-collecting them on a review/update-info pass) without the
  // broader, staff-only findAll() above -- which would otherwise let an
  // unauthenticated caller list every animal in the system by omitting the
  // customer filter. Declared before the plain :id route below since it's a
  // literal, more specific path (Nest/Express match by segment count, so there's
  // no real ambiguity, but the order keeps intent obvious).
  @Public()
  @Get('for-customer/:customerId')
  findSummaryForCustomer(@Param('customerId') customerId: string) {
    return this.animalsService.findSummaryForCustomer(customerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.animalsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAnimalDto) {
    return this.animalsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.animalsService.remove(id);
  }
}
