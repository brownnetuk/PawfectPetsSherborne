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
import { PublicUpdateAnimalDto } from './dto/public-update-animal.dto';
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

  // Public: lets the intake form load a customer's own pets in full -- to let
  // them review/edit their existing pets' details -- without the broader,
  // staff-only findAll() above, which would otherwise let an unauthenticated
  // caller list every animal in the system by omitting the customer filter.
  // Declared before the plain :id route below since it's a literal, more
  // specific path (Nest/Express match by segment count, so there's no real
  // ambiguity, but the order keeps intent obvious).
  @Public()
  @Get('for-customer/:customerId')
  findAllForCustomer(@Param('customerId') customerId: string) {
    return this.animalsService.findAll(customerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.animalsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAnimalDto) {
    return this.animalsService.update(id, dto);
  }

  // Public: the intake form uses this to let a customer edit their own existing
  // pet's details (vaccination, behaviour, etc.) when reviewing/updating their
  // info. Ownership is asserted server-side against :customerId rather than
  // trusted from the body -- see PublicUpdateAnimalDto and
  // AnimalsService.updateForCustomer.
  @Public()
  @Patch(':id/for-customer/:customerId')
  updateForCustomer(
    @Param('id') id: string,
    @Param('customerId') customerId: string,
    @Body() dto: PublicUpdateAnimalDto,
  ) {
    return this.animalsService.updateForCustomer(id, customerId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.animalsService.remove(id);
  }
}
