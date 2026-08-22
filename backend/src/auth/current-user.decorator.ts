import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Matches what JwtStrategy.validate() returns (backend/src/auth/jwt.strategy.ts),
// which Passport attaches to req.user.
export type CurrentUserShape = { id: string; email: string; name: string };

// Reads the already-validated req.user Passport attaches on any route that
// isn't @Public() -- see actor.util.ts for the two customer routes that
// can't use this because they're intentionally @Public().
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserShape => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserShape }>();
    return req.user ?? { id: '', email: '', name: 'Staff' };
  },
);
