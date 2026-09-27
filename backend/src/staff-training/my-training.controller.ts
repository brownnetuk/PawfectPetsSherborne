import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { TrainingAttemptsService } from './training-attempts.service';
import { TrainingModulesService } from './training-modules.service';

// No @RequirePermission anywhere in this controller -- any logged-in staff
// member manages their own assigned training, exactly like
// PoliciesController's ungated ':id/sign' route.
@Controller('training/my')
export class MyTrainingController {
  constructor(
    private readonly trainingModulesService: TrainingModulesService,
    private readonly trainingAttemptsService: TrainingAttemptsService,
  ) {}

  @Get()
  listAssigned(@CurrentUser() user: CurrentUserShape) {
    return this.trainingModulesService.listAssignedTo(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.trainingModulesService.findOneAssignedTo(id, user.id);
  }

  @Post(':id/start')
  startAttempt(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.trainingAttemptsService.startAttempt(id, user.id, user.name);
  }

  @Post('attempts/:attemptId/submit')
  submitAttempt(
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitAttemptDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.trainingAttemptsService.submitAttempt(attemptId, user.id, dto);
  }
}
