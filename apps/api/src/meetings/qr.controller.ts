import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { QrService } from './qr.service';

@ApiTags('qr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get('me')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  me(@CurrentUser() user: AuthUser) {
    return this.qr.myQr(user);
  }

  @Post('resolve')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  resolve(
    @CurrentUser() user: AuthUser,
    @Body() body: { code?: string; url?: string },
  ) {
    return this.qr.resolve(user, body);
  }
}
