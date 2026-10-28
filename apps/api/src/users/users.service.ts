import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { page?: number; pageSize?: number; q?: string }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where = params.q
      ? {
          OR: [
            { email: { contains: params.q, mode: 'insensitive' as const } },
            { firstName: { contains: params.q, mode: 'insensitive' as const } },
            { lastName: { contains: params.q, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          roles: { include: { role: { select: { code: true, name: true } } } },
          memberships: {
            include: {
              organization: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }
}
