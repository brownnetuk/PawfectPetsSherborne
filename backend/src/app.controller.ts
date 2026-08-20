import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  // Public: hosting platforms (Render, uptime monitors) ping this to check
  // the service is alive — it must not require a staff JWT.
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
