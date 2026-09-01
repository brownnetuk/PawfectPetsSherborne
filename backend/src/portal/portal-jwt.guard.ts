import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Enforces a valid customer (portal) token. Portal routes are also marked
// @Public() so the global staff JwtAuthGuard steps aside for them.
@Injectable()
export class PortalJwtGuard extends AuthGuard('portal-jwt') {}
