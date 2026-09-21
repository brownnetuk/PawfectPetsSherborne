import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { CreateFormSubmissionDto } from './dto/create-form-submission.dto';
import { SendFormSubmissionCopyDto } from './dto/send-form-submission-copy.dto';
import { SubmitFormSubmissionDto } from './dto/submit-form-submission.dto';
import { UpdateFormSubmissionDto } from './dto/update-form-submission.dto';
import { FormSubmissionsService } from './form-submissions.service';

@Controller('form-submissions')
export class FormSubmissionsController {
  constructor(
    private readonly formSubmissionsService: FormSubmissionsService,
  ) {}

  // Staff: "generate a link" for a form.
  @Post()
  create(@Body() dto: CreateFormSubmissionDto) {
    return this.formSubmissionsService.create(dto);
  }

  @Get()
  findAll(@Query('customer') customer?: string) {
    return this.formSubmissionsService.findAll(customer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.formSubmissionsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFormSubmissionDto) {
    return this.formSubmissionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.formSubmissionsService.remove(id);
  }

  @Post(':id/send-copy')
  sendCopy(@Param('id') id: string, @Body() dto: SendFormSubmissionCopyDto) {
    return this.formSubmissionsService.sendCopy(id, dto);
  }

  // Public: the form-fill page fetches by id (from its emailed link).
  @Public()
  @Get(':id/public')
  findOnePublic(@Param('id') id: string) {
    return this.formSubmissionsService.findOnePublic(id);
  }

  // Public: the customer's own submit action.
  @Public()
  @Post(':id/submit')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitFormSubmissionDto,
    @Req() req: Request,
  ) {
    return this.formSubmissionsService.submit(id, dto.answers, req);
  }
}
