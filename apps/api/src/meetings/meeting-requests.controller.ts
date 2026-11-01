import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import { MeetingRequestsService } from './meeting-requests.service';
import { RecommendationsService } from './recommendations.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('meeting-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class MeetingRequestsController {
  constructor(
    private readonly requests: MeetingRequestsService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get('meeting-requests')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  list(@CurrentUser() user: AuthUser) {
    return this.requests.listForUser(user);
  }

  @Get('meeting-requests/booking-window')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  bookingWindow() {
    return this.requests.bookingWindow();
  }

  @Get('meeting-requests/slots')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  slots(
    @Query('date') date: string,
    @Query('requestId') requestId?: string,
    @Query('fromOrgId') fromOrgId?: string,
    @Query('toOrgId') toOrgId?: string,
  ) {
    return this.requests.availableSlots(date, {
      requestId,
      fromOrgId,
      toOrgId,
    });
  }

  @Get('meeting-requests/now-window')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  nowWindow(
    @CurrentUser() user: AuthUser,
    @Query('fromOrgId') fromOrgId: string,
    @Query('toOrgId') toOrgId: string,
  ) {
    return this.requests.nowWindow(user, fromOrgId, toOrgId);
  }

  @Get('recommendations')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  recommendations(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.recommendationsService.forActor(
      user,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('recommendations/browse')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  browseRecommendations(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('tags') tags?: string | string[],
  ) {
    const tagList = Array.isArray(tags)
      ? tags.flatMap((value) => value.split(','))
      : typeof tags === 'string'
        ? tags.split(',')
        : [];
    return this.recommendationsService.browsePeers(user, {
      q,
      page: page ? Number(page) : 1,
      // Omit pageSize to return the full directory (no artificial ceiling).
      pageSize: pageSize ? Number(pageSize) : undefined,
      tags: tagList,
    });
  }

  @Get('recommendations/:organizationId/profile')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  recommendationProfile(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
  ) {
    return this.recommendationsService.publicProfile(user, organizationId);
  }

  @Post('recommendations/:organizationId/dismiss')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  dismissRecommendation(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
  ) {
    return this.recommendationsService.dismissPeer(user, organizationId);
  }

  @Post('meeting-requests')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      fromOrgId: string;
      toOrgId: string;
      message?: string;
      startsAt?: string;
      placeId?: string;
      mode?: 'SCHEDULED' | 'NOW' | 'INTEREST';
    },
  ) {
    return this.requests.create(user, body);
  }

  @Post('meeting-requests/:id/accept')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.acceptInterest(user, id);
  }

  @Post('meeting-requests/:id/decline')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.requests.decline(user, id, body.reason);
  }

  @Post('meeting-requests/:id/propose')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  propose(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { startsAt: string; placeId?: string },
  ) {
    return this.requests.proposeSchedule(user, id, body);
  }

  @Post('meeting-requests/:id/confirm')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.confirmSchedule(user, id);
  }
}
