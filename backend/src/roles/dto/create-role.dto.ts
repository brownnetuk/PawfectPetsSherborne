import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  // Not validated against a closed enum -- the frontend's permissionCatalog.ts
  // is the source of truth for which keys are offered; an unrecognised string
  // here is simply never matched by any @RequirePermission() check, harmless.
  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}
