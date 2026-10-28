import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import { RequirePermissions } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('entityType') entityType?: string,
  ) {
    const p = Number(page) || 1;
    const size = Math.min(Number(pageSize) || 20, 100);
    const where = entityType ? { entityType } : undefined;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * size,
        take: size,
        include: {
          actor: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, page: p, pageSize: size, total };
  }
}
