import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { CreateFormSubmissionDto } from './dto/create-form-submission.dto';
import { SubmitFormSubmissionDto } from './dto/submit-form-submission.dto';
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
