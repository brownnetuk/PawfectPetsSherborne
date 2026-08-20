import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Protected by the global guard: only an already-logged-in staff member can add another.
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  @Get('staff')
  listStaff() {
    return this.authService.listStaff();
  }

  @Delete('staff/:id')
  deleteStaff(@Param('id') id: string) {
    return this.authService.deleteStaff(id);
  }
}
