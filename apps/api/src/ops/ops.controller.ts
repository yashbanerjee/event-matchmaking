import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import { RequirePermissions } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('ops')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class OpsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('feedback')
  @RequirePermissions(PERMISSIONS.FEEDBACK_READ_ALL)
  async feedback(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const p = Number(page) || 1;
    const size = Math.min(Number(pageSize) || 20, 100);
    const [items, total] = await Promise.all([
      this.prisma.meetingFeedback.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * size,
        take: size,
        include: {
          organization: { select: { id: true, name: true, code: true } },
          meeting: {
            select: {
              id: true,
              startsAt: true,
              companyOrg: { select: { name: true } },
              vendorOrg: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.meetingFeedback.count(),
    ]);
    return { items, page: p, pageSize: size, total };
  }

  @Get('follow-ups')
  @RequirePermissions(PERMISSIONS.MEETINGS_MANAGE)
  async followUps(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const p = Number(page) || 1;
    const size = Math.min(Number(pageSize) || 20, 100);
    const [items, total] = await Promise.all([
      this.prisma.followUpAction.findMany({
        orderBy: [{ completedAt: 'asc' }, { dueAt: 'asc' }],
        skip: (p - 1) * size,
        take: size,
        include: {
          organization: { select: { name: true, code: true } },
          assignee: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.followUpAction.count(),
    ]);
    return { items, page: p, pageSize: size, total };
  }

  @Get('notifications')
  @RequirePermissions(PERMISSIONS.JOBS_MANAGE)
  async notifications(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    const p = Number(page) || 1;
    const size = Math.min(Number(pageSize) || 20, 100);
    const [items, total] = await Promise.all([
      this.prisma.notificationEvent.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * size,
        take: size,
        include: { deliveries: true },
      }),
      this.prisma.notificationEvent.count(),
    ]);
    return { items, page: p, pageSize: size, total };
  }

  @Get('profiles')
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  async profiles() {
    const [companies, vendors] = await Promise.all([
      this.prisma.company.findMany({
        include: {
          organization: {
            select: { id: true, code: true, name: true, status: true, industry: true },
          },
        },
        take: 200,
      }),
      this.prisma.vendor.findMany({
        include: {
          organization: {
            select: { id: true, code: true, name: true, status: true, industry: true },
          },
        },
        take: 200,
      }),
    ]);
    return { companies, vendors };
  }

  @Get('workflows')
  @RequirePermissions(PERMISSIONS.FORMS_READ)
  workflows() {
    return this.prisma.onboardingWorkflow.findMany({
      include: { versions: { orderBy: { version: 'desc' }, take: 3 } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
