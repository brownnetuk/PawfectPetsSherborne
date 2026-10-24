import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { RecycleBinService } from './recycle-bin.service';

// Settings > Recycle Bin. Listing and restoring aren't gated -- putting back
// something that was deleted is never destructive, and whoever deleted it
// by mistake should be able to undo that themselves. Permanently deleting
// is, so it needs recycleBin.purge (granted to the Admin role).
@Controller('recycle-bin')
export class RecycleBinController {
  constructor(private readonly recycleBin: RecycleBinService) {}

  @Get()
  findAll() {
    return this.recycleBin.findAll();
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.recycleBin.restore(id);
  }

  @RequirePermission('recycleBin.purge')
  @Delete(':id')
  purge(@Param('id') id: string) {
    return this.recycleBin.purge(id);
  }

  @RequirePermission('recycleBin.purge')
  @Delete()
  empty() {
    return this.recycleBin.empty();
  }
}
