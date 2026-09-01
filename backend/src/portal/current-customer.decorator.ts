import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentCustomerData {
  customerId: string;
  email: string;
}

// Pulls the authenticated customer (set by PortalJwtStrategy.validate) off the
// request. Mirrors @CurrentUser() on the staff side.
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentCustomerData =>
    ctx.switchToHttp().getRequest().user,
);
