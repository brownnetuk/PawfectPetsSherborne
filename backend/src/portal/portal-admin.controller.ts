import { Body, Controller, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { PortalService } from './portal.service';
import { SetPortalActiveDto } from './dto/portal-auth.dto';

// Staff-facing portal administration (Customer Detail > Customer Defaults >
// Customer Portal card). NOT @Public(), so the global staff JwtAuthGuard
// protects these — only logged-in staff can toggle access or send a reset.
@Controller('customers/:id/portal')
export class PortalAdminController {
  constructor(private readonly portal: PortalService) {}

  // Turn a customer's portal access on/off.
  @Patch()
  async setActive(@Param('id') id: string, @Body() dto: SetPortalActiveDto) {
    return this.portal.setPortalActive(id, dto.active);
  }

  // "Password reset" button — emails this customer a reset code.
  @Post('reset')
  @HttpCode(200)
  async sendReset(@Param('id') id: string) {
    return this.portal.adminSendReset(id);
  }
}
