import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Role } from '../../roles/schemas/role.schema';

@Schema({ timestamps: true })
export class Staff extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  // The login identifier -- separate from email, which is now just a
  // contact address. `sparse` so pre-existing accounts (created before this
  // field existed) don't collide on the shared "missing" value before
  // AuthService's onModuleInit backfill (username := email) runs.
  @Prop({ required: true, unique: true, sparse: true, lowercase: true })
  username: string;

  // bcrypt hash — never expose this field in API responses.
  @Prop({ required: true })
  passwordHash: string;

  // Break-glass accounts skip Business Info > Trusted IPs entirely at login
  // (see AuthService.login) -- an intentional, explicitly-labelled exception
  // for when the trusted-IP list is wrong/stale and normal accounts are
  // locked out, not a general-purpose flag. Password auth is still required
  // as normal; this only bypasses the IP check. It also bypasses every
  // PermissionsGuard check below, same "trusted, bypasses everything" idea.
  @Prop({ default: false })
  isBreakGlass?: boolean;

  // Unset means full access (see PermissionsGuard) -- the safe default so
  // every existing staff account keeps today's behaviour until someone
  // deliberately assigns a restrictive role (Settings > Staff > Access
  // Permissions).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Role.name })
  role?: Types.ObjectId;

  // Blocks login (AuthService.login) and, for an already-issued token,
  // blocks every subsequent request too (PermissionsGuard checks this on
  // every authenticated route, not just permission-gated ones) -- locking
  // an account takes effect immediately rather than waiting for its current
  // token to expire.
  @Prop({ default: false })
  locked?: boolean;
}

export const StaffSchema = SchemaFactory.createForClass(Staff);
