import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from './require-permission.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
  }

  // Creating/listing/editing/deleting staff accounts is itself a
  // privilege-escalation-relevant action, so it's staff.manage, same as
  // roles themselves (roles.controller.ts).
  @RequirePermission('staff.manage')
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  @RequirePermission('staff.manage')
  @Get('staff')
  listStaff() {
    return this.authService.listStaff();
  }

  @RequirePermission('staff.manage')
  @Patch('staff/:id')
  updateStaff(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.authService.updateStaff(id, dto);
  }

  @RequirePermission('staff.manage')
  @Delete('staff/:id')
  deleteStaff(@Param('id') id: string) {
    return this.authService.deleteStaff(id);
  }

  @RequirePermission('staff.manage')
  @Post('staff/:id/password')
  changePassword(@Param('id') id: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(id, dto);
  }
}
