import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreditNotesService } from './credit-notes.service';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';

@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Post()
  create(@Body() dto: CreateCreditNoteDto, @CurrentUser() user: CurrentUserShape) {
    return this.creditNotesService.create(dto, user.name);
  }

  @Get()
  findAll(@Query('customer') customer?: string) {
    return this.creditNotesService.findAll(customer);
  }

  @RequirePermission('financial.manage')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.creditNotesService.remove(id, user.name);
  }
}
