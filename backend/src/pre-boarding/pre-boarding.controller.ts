import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreatePreBoardingFormDto } from './dto/create-pre-boarding-form.dto';
import { SubmitPreBoardingFormDto } from './dto/submit-pre-boarding-form.dto';
import { UpdatePreBoardingSettingsDto } from './dto/update-pre-boarding-settings.dto';
import { PreBoardingService } from './pre-boarding.service';

@Controller('pre-boarding')
export class PreBoardingController {
  constructor(private readonly preBoardingService: PreBoardingService) {}

  // Declared before ':id' so 'settings' isn't read as a form id.
  @Get('settings')
  getSettings() {
    return this.preBoardingService.getSettings();
  }

  @Put('settings')
  @RequirePermission('settings.manage')
  updateSettings(@Body() dto: UpdatePreBoardingSettingsDto) {
    return this.preBoardingService.updateSettings(dto);
  }

  @Post('settings/reset-questions')
  @RequirePermission('settings.manage')
  resetQuestions() {
    return this.preBoardingService.resetQuestions();
  }

  @Post()
  create(@Body() dto: CreatePreBoardingFormDto) {
    return this.preBoardingService.create(dto);
  }

  @Get()
  findAll() {
    return this.preBoardingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.preBoardingService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.preBoardingService.remove(id);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.preBoardingService.send(id);
  }

  // Public: the owner's questionnaire page fetches by id (from its emailed link).
  @Public()
  @Get(':id/public')
  findOnePublic(@Param('id') id: string) {
    return this.preBoardingService.findOnePublic(id);
  }

  // Public: the owner's own submit action.
  @Public()
  @Post(':id/submit')
  submit(@Param('id') id: string, @Body() dto: SubmitPreBoardingFormDto) {
    return this.preBoardingService.submit(id, dto.dogNames, dto.answers);
  }
}
