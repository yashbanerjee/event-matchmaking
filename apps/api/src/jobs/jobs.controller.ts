import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.JOBS_MANAGE)
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.jobs.list({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      status,
    });
  }

  @Post(':id/retry')
  @RequirePermissions(PERMISSIONS.JOBS_MANAGE)
  retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.retry(user, id);
  }
}
