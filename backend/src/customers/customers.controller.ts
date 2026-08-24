import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { actorFromRequest } from '../auth/actor.util';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Public: the intake form itself creates a Customer directly when it isn't
  // starting from a staff-created lead link. Also used by the admin app's own
  // "New customer" -- see actor.util.ts for why actor attribution here is
  // best-effort rather than a proper @CurrentUser().
  @Public()
  @Post()
  create(@Body() dto: CreateCustomerDto, @Req() req: Request) {
    return this.customersService.create(dto, actorFromRequest(req));
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
    return {
      instructions: await this.customersService.getAlarmInstructions(id),
    };
  }

  // Public: the intake form completes its own (lead or fresh) record on submit.
  // Also used by the admin app's own EditCustomerModal -- see actor.util.ts.
  @Public()
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: Request,
  ) {
    return this.customersService.update(id, dto, actorFromRequest(req));
  }

  // Staff-only (deliberately not @Public()): the public intake form's own PATCH
  // above only ever sets status via the completeness check, never directly.
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerStatusDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.customersService.updateStatus(id, dto.status, user.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
