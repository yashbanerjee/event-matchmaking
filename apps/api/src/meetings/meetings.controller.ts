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
import { FeedbackOutcome } from '@prisma/client';
import { PERMISSIONS } from '@em/shared';
import { MeetingsService } from './meetings.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.meetings.listForUser(user, {
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.meetings.confirm(user, id, body.note);
  }

  @Post(':id/reschedule-request')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.meetings.requestReschedule(user, id, body.reason);
  }

  @Post(':id/feedback')
  @RequirePermissions(PERMISSIONS.FEEDBACK_SUBMIT)
  feedback(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      organizationId: string;
      attendanceConfirmed: boolean;
      meetingQuality?: number;
      relevance?: number;
      businessPotential?: number;
      communicationQuality?: number;
      interestLevel?: number;
      followUpRequired?: boolean;
      followUpDate?: string;
      outcome: FeedbackOutcome;
      outcomeCustom?: string;
      comments?: string;
      isConfidential?: boolean;
    },
  ) {
    return this.meetings.submitFeedback(user, { ...body, meetingId: id });
  }
}
