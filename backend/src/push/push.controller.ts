import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  // The mobile app posts its APNs device token here after the user grants
  // notification permission (authenticated as the logged-in staff member).
  @Post('register')
  async register(@Body() dto: RegisterPushTokenDto, @CurrentUser() user: CurrentUserShape) {
    await this.pushService.registerToken(dto.token, dto.platform ?? 'ios', user.id);
    return { ok: true };
  }

  @Delete('register/:token')
  async unregister(@Param('token') token: string) {
    await this.pushService.removeToken(token);
    return { ok: true };
  }
}
