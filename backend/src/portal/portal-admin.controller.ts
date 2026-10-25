import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PortalService } from './portal.service';
import {
  AddPortalUserDto,
  SetPortalActiveDto,
  TestPushDto,
} from './dto/portal-auth.dto';

// Staff-facing portal administration (Customer Detail > Customer Defaults >
// Customer Portal card). NOT @Public(), so the global staff JwtAuthGuard
// protects these — only logged-in staff can toggle access or send a reset.
@Controller('customers/:id/portal')
export class PortalAdminController {
  constructor(private readonly portal: PortalService) {}

  // Login/usage status shown on the Mobile App Access card.
  @Get('status')
  async status(@Param('id') id: string) {
    return this.portal.getPortalStatus(id);
  }

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

  // "Add additional access": another person with the same app access.
  @Post('users')
  @HttpCode(200)
  async addUser(@Param('id') id: string, @Body() dto: AddPortalUserDto) {
    return this.portal.addPortalUser(id, dto);
  }

  @Delete('users/:userId')
  async removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.portal.removePortalUser(id, userId);
  }

  // Per-user "Password reset" — emails that additional user a reset code.
  @Post('users/:userId/reset')
  @HttpCode(200)
  async sendUserReset(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.portal.adminSendUserReset(id, userId);
  }

  // "Send test push" button — pushes a free-text message to this customer's app.
  @Post('test-push')
  @HttpCode(200)
  async testPush(@Param('id') id: string, @Body() dto: TestPushDto) {
    return this.portal.adminSendTestPush(id, dto.message);
  }
}
