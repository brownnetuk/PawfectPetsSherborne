import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { portalJwtSecret } from './portal-jwt.util';

// The customer (portal) payload — `typ: 'portal'` is a belt-and-braces marker
// on top of the separate signing secret.
export interface PortalJwtPayload {
  sub: string; // customer id
  email: string;
  typ: 'portal';
}

@Injectable()
export class PortalJwtStrategy extends PassportStrategy(Strategy, 'portal-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: portalJwtSecret(config.getOrThrow<string>('JWT_SECRET')),
    });
  }

  validate(payload: PortalJwtPayload) {
    return { customerId: payload.sub, email: payload.email };
  }
}
