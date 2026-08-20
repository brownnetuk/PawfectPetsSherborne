import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as reachable without a staff JWT — used for the endpoints the
// public (unauthenticated) intake form itself calls.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
