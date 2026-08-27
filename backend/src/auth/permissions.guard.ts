import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { Staff } from '../staff/schemas/staff.schema';
import { CurrentUserShape } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSION_KEY } from './require-permission.decorator';

// Registered as a second global guard (app.module.ts) alongside JwtAuthGuard,
// which runs first -- so by the time this runs on a non-@Public() route,
// req.user is already populated. A route with no @RequirePermission() is a
// no-op here (most routes -- see the plan doc for exactly which are gated).
//
// Access is granted if: the route isn't gated, the staff member is
// break-glass (same "trusted, bypasses everything" semantics it already has
// for the login IP check), the staff member has no role assigned (today's
// default -- existing accounts keep full access until someone deliberately
// assigns a restrictive role), or the assigned role includes the required key.
@Injectable()
export class PermissionsGuard {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: CurrentUserShape }>();
    const userId = req.user?.id;
    if (!userId) {
      return false;
    }
    const staff = await this.staffModel.findById(userId).populate<{ role: { permissions: string[] } | null }>('role').exec();
    if (!staff) {
      return false;
    }
    if (staff.isBreakGlass) {
      return true;
    }
    if (!staff.role) {
      return true;
    }
    if (staff.role.permissions.includes(required)) {
      return true;
    }
    throw new ForbiddenException(
      `You don't have permission to do that -- ask a staff member with access to grant you the "${required}" permission.`,
    );
  }
}
