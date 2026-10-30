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
import { PeerRecommendationsService } from './peer-recommendations.service';
import { RequirePermissions } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('peer-recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('peer-recommendations')
export class PeerRecommendationsController {
  constructor(private readonly peers: PeerRecommendationsService) {}

  /** Admin overview: every eligible client/guest with top AI recommendations */
  @Get()
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  overview(
    @Query('type') type?: 'COMPANY' | 'VENDOR',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.peers.listOverview({
      type,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      q,
    });
  }

  @Get('org/:organizationId')
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  forOrg(
    @Param('organizationId') organizationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.peers.listForOrganization(
      organizationId,
      limit ? Number(limit) : 50,
    );
  }

  @Post('org/:organizationId/recompute')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  async recompute(@Param('organizationId') organizationId: string) {
    const result = await this.peers.recomputeForOrganization(organizationId);
    return { ok: true, ...result };
  }
}
