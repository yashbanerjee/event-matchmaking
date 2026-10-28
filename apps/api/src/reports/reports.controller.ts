import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '@em/shared';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  summary() {
    return this.reports.summary();
  }

  @Get('export/:kind')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  @Header('Content-Type', 'text/csv')
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: 'meetings' | 'feedback' | 'summary',
    @Res() res: Response,
  ) {
    const file = await this.reports.exportCsv(user, kind);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.setHeader('X-Report-Generated-At', file.generatedAt);
    res.send(file.body);
  }

  @Post('async')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  enqueue(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind = 'summary',
  ) {
    return this.reports.enqueueAsyncReport(user, kind);
  }
}
