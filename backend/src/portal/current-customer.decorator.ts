import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentCustomerData {
  customerId: string;
  email: string;
  // Set when an additional user (not the customer themselves) is signed in.
  portalUserId?: string;
}

// Pulls the authenticated customer (set by PortalJwtStrategy.validate) off the
// request. Mirrors @CurrentUser() on the staff side.
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentCustomerData =>
    ctx.switchToHttp().getRequest().user,
);
