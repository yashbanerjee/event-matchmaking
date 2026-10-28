import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async registerPush(
    actor: AuthUser,
    input: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    },
  ) {
    const endpoint = input.endpoint?.trim();
    const p256dh = input.keys?.p256dh?.trim();
    const auth = input.keys?.auth?.trim();
    if (!endpoint || !p256dh || !auth) {
      throw new BadRequestException('endpoint and keys are required');
    }

    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: actor.id,
        endpoint,
        p256dh,
        auth,
        userAgent: input.userAgent?.trim() || null,
      },
      update: {
        userId: actor.id,
        p256dh,
        auth,
        userAgent: input.userAgent?.trim() || null,
      },
    });
  }

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
