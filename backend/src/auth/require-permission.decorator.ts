import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

// Marks a route as needing a specific permission (see permissions.catalog.ts
// for the valid keys) -- checked by PermissionsGuard, a second global guard
// alongside JwtAuthGuard. Mirrors the Public()/IS_PUBLIC_KEY pattern.
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
