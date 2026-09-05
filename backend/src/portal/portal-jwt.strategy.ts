import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Customer } from '../customers/schemas/customer.schema';
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
  constructor(
    config: ConfigService,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: portalJwtSecret(config.getOrThrow<string>('JWT_SECRET')),
    });
  }

  // Re-checks portalActive on every request so disabling a customer's Mobile
  // App Access revokes all their sessions immediately (their next call 401s,
  // and the app's unauthorized handler logs them out).
  async validate(payload: PortalJwtPayload) {
    const customer = await this.customerModel
      .findById(payload.sub)
      .select('portalActive')
      .exec();
    if (!customer || !customer.portalActive) {
      throw new UnauthorizedException('Mobile app access has been disabled.');
    }
    return { customerId: payload.sub, email: payload.email };
  }
}
