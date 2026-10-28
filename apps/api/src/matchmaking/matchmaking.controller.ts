import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type MatchingWeights } from '@em/shared';
import { MatchmakingService } from './matchmaking.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('matchmaking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}

  @Put('rules/default/weights')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  updateWeights(
    @CurrentUser() user: AuthUser,
    @Body() body: MatchingWeights,
  ) {
    return this.matchmaking.updateWeights(user, body);
  }

  @Post('runs')
  @RequirePermissions(PERMISSIONS.MATCHING_RUN)
  startRun(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.matchmaking.startRun(user, body);
  }

  @Get('runs/:id')
  @RequirePermissions(PERMISSIONS.MATCHING_RUN)
  getRun(@Param('id') id: string) {
    return this.matchmaking.getRun(id);
  }

  @Post('schedules/:id/publish')
  @RequirePermissions(PERMISSIONS.SCHEDULE_PUBLISH)
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.matchmaking.publishSchedule(user, id);
  }

  @Post('schedules/manual-assign')
  @RequirePermissions(PERMISSIONS.SCHEDULE_OVERRIDE)
  manualAssign(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      scheduleVersionId: string;
      companyOrgId: string;
      vendorOrgId: string;
      slotIndex: number;
      reason: string;
    },
  ) {
    return this.matchmaking.manualAssign(user, body);
  }

  @Post('meetings')
  @RequirePermissions(PERMISSIONS.SCHEDULE_OVERRIDE)
  createManualMeeting(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      companyOrgId: string;
      vendorOrgId: string;
      startsAt: string;
      durationMinutes?: number;
      reason?: string;
    },
  ) {
    return this.matchmaking.createManualMeeting(user, body);
  }

  @Get('dates/:scheduleDate/status')
  @RequirePermissions(PERMISSIONS.MATCHING_RUN)
  dateStatus(@Param('scheduleDate') scheduleDate: string) {
    return this.matchmaking
      .countActiveMeetingsForDate(scheduleDate)
      .then((meetingCount) => ({
        scheduleDate,
        meetingCount,
        canGenerate: meetingCount === 0,
      }));
  }

  @Patch('meetings/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_OVERRIDE)
  updateMeeting(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      companyOrgId?: string;
      vendorOrgId?: string;
      startsAt?: string;
      reason?: string;
    },
  ) {
    return this.matchmaking.updateMeeting(user, id, body);
  }

  @Delete('meetings/:id')
  @RequirePermissions(PERMISSIONS.SCHEDULE_OVERRIDE)
  deleteMeeting(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.matchmaking.deleteMeeting(user, id, body?.reason);
  }
}
