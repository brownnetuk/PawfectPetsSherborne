import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A named set of permission keys (see backend/src/auth/require-permission.decorator.ts
// for how a key gates a route, and admin/src/utils/permissionCatalog.ts for the
// full catalog of valid keys) -- staff create these under Settings > Staff >
// Access Permissions and assign one to each Staff record (Staff.role below).
@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];
}

export const RoleSchema = SchemaFactory.createForClass(Role);
