import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { SubmitFormSubmissionDto } from '../form-submissions/dto/submit-form-submission.dto';
import { CustomerRiskAssessmentsService } from './customer-risk-assessments.service';
import { CustomerRiskAssessmentCustomerDto } from './dto/customer-risk-assessment.dto';

// Filling one in goes through the ordinary form-submission endpoints
// (GET /form-submissions/:id/public, POST /form-submissions/:id/submit) --
// these just start, list, correct, re-link and remove them.
@Controller('customer-risk-assessments')
export class CustomerRiskAssessmentsController {
  constructor(private readonly customerRiskAssessmentsService: CustomerRiskAssessmentsService) {}

  @Get()
  findAll(@Query('customer') customer?: string) {
    return this.customerRiskAssessmentsService.findAll(customer);
  }

  @Post()
  create(@Body() dto: CustomerRiskAssessmentCustomerDto) {
    return this.customerRiskAssessmentsService.create(dto.customer);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SubmitFormSubmissionDto, @CurrentUser() user: CurrentUserShape) {
    return this.customerRiskAssessmentsService.updateAnswers(id, dto.answers, user.name);
  }

  @Patch(':id/customer')
  move(
    @Param('id') id: string,
    @Body() dto: CustomerRiskAssessmentCustomerDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.customerRiskAssessmentsService.move(id, dto.customer, user.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customerRiskAssessmentsService.remove(id);
  }
}
