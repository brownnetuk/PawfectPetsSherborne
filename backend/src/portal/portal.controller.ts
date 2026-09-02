import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { PortalService } from './portal.service';
import { PortalJwtGuard } from './portal-jwt.guard';
import { CurrentCustomer } from './current-customer.decorator';
import type { CurrentCustomerData } from './current-customer.decorator';
import {
  LoginDto,
  RegisterPushDto,
  RequestCodeDto,
  SetPasswordDto,
  UpdateMeDto,
  VerifyCodeDto,
} from './dto/portal-auth.dto';
import { PortalCreateAnimalDto } from './dto/portal-animal.dto';
import { PublicUpdateAnimalDto } from '../animals/dto/public-update-animal.dto';
import { SendMessageDto } from '../messages/dto/send-message.dto';

// Customer-facing portal. @Public() at the class level takes the routes out of
// the global staff auth guard; the protected ones re-guard with the customer
// realm via PortalJwtGuard.
@Public()
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  // First-time login: email me a 6-digit code. Always 200 (see requestCode).
  @Post('request-code')
  @HttpCode(200)
  async requestCode(@Body() dto: RequestCodeDto) {
    await this.portal.requestCode(dto.email, 'login');
    return { ok: true };
  }

  // Forgotten password: email me a 6-digit reset code. Always 200.
  @Post('request-reset')
  @HttpCode(200)
  async requestReset(@Body() dto: RequestCodeDto) {
    await this.portal.requestCode(dto.email, 'reset');
    return { ok: true };
  }

  @Post('verify-code')
  @HttpCode(200)
  async verifyCode(@Body() dto: VerifyCodeDto) {
    await this.portal.verifyCode(dto.email, dto.code);
    return { ok: true };
  }

  @Post('set-password')
  @HttpCode(200)
  async setPassword(@Body() dto: SetPasswordDto) {
    return this.portal.setPassword(dto.email, dto.code, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    return this.portal.login(dto.email, dto.password);
  }

  @UseGuards(PortalJwtGuard)
  @Get('me')
  async me(@CurrentCustomer() customer: CurrentCustomerData) {
    return this.portal.getProfile(customer.customerId);
  }

  @UseGuards(PortalJwtGuard)
  @Patch('me')
  async updateMe(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Body() dto: UpdateMeDto,
  ) {
    return this.portal.updateProfile(customer.customerId, dto);
  }

  @UseGuards(PortalJwtGuard)
  @Get('invoices')
  async invoices(@CurrentCustomer() customer: CurrentCustomerData) {
    return this.portal.listInvoices(customer.customerId);
  }

  @UseGuards(PortalJwtGuard)
  @Get('invoices/:id/pdf')
  async invoicePdf(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.portal.invoicePdf(customer.customerId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${id}.pdf"`,
    });
    res.send(pdf);
  }

  @UseGuards(PortalJwtGuard)
  @Post('invoices/:id/send')
  @HttpCode(200)
  async sendInvoice(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Param('id') id: string,
  ) {
    return this.portal.sendInvoice(customer.customerId, id);
  }

  @UseGuards(PortalJwtGuard)
  @Get('quotes')
  async quotes(@CurrentCustomer() customer: CurrentCustomerData) {
    return this.portal.listQuotes(customer.customerId);
  }

  @UseGuards(PortalJwtGuard)
  @Post('quotes/:id/accept')
  @HttpCode(200)
  async acceptQuote(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Param('id') id: string,
  ) {
    return this.portal.acceptQuote(customer.customerId, id);
  }

  @UseGuards(PortalJwtGuard)
  @Post('quotes/:id/decline')
  @HttpCode(200)
  async declineQuote(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Param('id') id: string,
  ) {
    return this.portal.declineQuote(customer.customerId, id);
  }

  @UseGuards(PortalJwtGuard)
  @Get('bookings')
  async bookings(@CurrentCustomer() customer: CurrentCustomerData) {
    return this.portal.listBookings(customer.customerId);
  }

  @UseGuards(PortalJwtGuard)
  @Get('animals')
  async animals(@CurrentCustomer() customer: CurrentCustomerData) {
    return this.portal.listAnimals(customer.customerId);
  }

  @UseGuards(PortalJwtGuard)
  @Post('animals')
  async createAnimal(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Body() dto: PortalCreateAnimalDto,
  ) {
    return this.portal.createAnimal(customer.customerId, dto);
  }

  @UseGuards(PortalJwtGuard)
  @Patch('animals/:id')
  async updateAnimal(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Param('id') id: string,
    @Body() dto: PublicUpdateAnimalDto,
  ) {
    return this.portal.updateAnimal(customer.customerId, id, dto);
  }

  @UseGuards(PortalJwtGuard)
  @Post('push/register')
  @HttpCode(200)
  async registerPush(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Body() dto: RegisterPushDto,
  ) {
    await this.portal.registerPush(customer.customerId, dto.token, dto.platform);
    return { ok: true };
  }

  // --- messages ---

  @UseGuards(PortalJwtGuard)
  @Get('messages')
  async messages(@CurrentCustomer() customer: CurrentCustomerData) {
    return this.portal.messagesThread(customer.customerId);
  }

  @UseGuards(PortalJwtGuard)
  @Get('messages/unread-count')
  async messagesUnread(@CurrentCustomer() customer: CurrentCustomerData) {
    return this.portal.messagesUnread(customer.customerId);
  }

  @UseGuards(PortalJwtGuard)
  @Post('messages')
  async sendMessage(
    @CurrentCustomer() customer: CurrentCustomerData,
    @Body() dto: SendMessageDto,
  ) {
    return this.portal.sendMessage(customer.customerId, dto.body);
  }
}
