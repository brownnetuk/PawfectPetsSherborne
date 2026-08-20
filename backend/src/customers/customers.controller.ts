import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Public: the intake form itself creates a Customer directly when it isn't
  // starting from a staff-created lead link.
  @Public()
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  // Staff-only: creating a lead link is a staff action.
  @Post('leads')
  createLead(@Body() dto: CreateLeadDto) {
    return this.customersService.createLead(dto);
  }

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  // Public: the intake form fetches by id (from its link) to pre-fill screen 1.
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Get(':id/alarm-instructions')
  async getAlarmInstructions(@Param('id') id: string) {
    return { instructions: await this.customersService.getAlarmInstructions(id) };
  }

  // Public: the intake form completes its own (lead or fresh) record on submit.
  @Public()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
