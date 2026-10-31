import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import { PeerRecommendationsService } from './peer-recommendations.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
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

  /** Opposite-type candidates for admin add (client→guests / guest→clients) */
  @Get('org/:organizationId/candidates')
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  candidates(
    @Param('organizationId') organizationId: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.peers.listCandidates(organizationId, {
      q,
      limit: limit ? Number(limit) : 30,
    });
  }

  @Post('org/:organizationId')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  addManual(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() body: { toOrgId: string; note?: string },
  ) {
    return this.peers.addManual(user, organizationId, body);
  }

  @Delete('org/:organizationId/:toOrgId')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  removeManual(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('toOrgId') toOrgId: string,
  ) {
    return this.peers.removeManual(user, organizationId, toOrgId);
  }

  @Post('org/:organizationId/recompute')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  async recompute(@Param('organizationId') organizationId: string) {
    const result = await this.peers.recomputeForOrganization(organizationId);
    return { ok: true, ...result };
  }
}
