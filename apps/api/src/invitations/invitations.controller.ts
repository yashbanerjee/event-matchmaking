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
import { InvitationsService } from './invitations.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.INVITATIONS_MANAGE)
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      email: string;
      organizationId: string;
      roleCode:
        | 'SUPER_ADMIN'
        | 'ADMIN'
        | 'COMPANY_USER'
        | 'VENDOR_USER'
        | 'OPERATIONS_MANAGER';
      onboardingWorkflowId?: string;
    },
  ) {
    return this.invitations.create(user, body);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INVITATIONS_MANAGE)
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.invitations.list({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      status,
    });
  }

  @Post(':id/revoke')
  @RequirePermissions(PERMISSIONS.INVITATIONS_MANAGE)
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.revoke(user, id);
  }
}
