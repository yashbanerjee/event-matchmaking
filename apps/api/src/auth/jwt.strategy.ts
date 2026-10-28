import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ROLE_PERMISSIONS, type RoleCode } from '@em/shared';
import { EnvService } from '../config/env.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    env: EnvService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.jwtAccessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: true } },
        memberships: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }

    const roles = user.roles.map((r) => r.role.code as RoleCode);
    const permissions = [
      ...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? [])),
    ];

    return {
      id: user.id,
      email: user.email,
      roles,
      permissions,
      organizationIds: user.memberships.map((m) => m.organizationId),
    };
  }
}
