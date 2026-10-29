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

  @Get('recommendations')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  recommendations(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    return this.recommendationsService.forActor(
      user,
      limit ? Number(limit) : 10,
    );
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
    @Body() body: { startsAt: string; placeId: string },
  ) {
    return this.requests.proposeSchedule(user, id, body);
  }

  @Post('meeting-requests/:id/confirm')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.confirmSchedule(user, id);
  }
}
