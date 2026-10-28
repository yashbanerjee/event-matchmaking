import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  loginSchema,
  registerFromInvitationSchema,
  type LoginInput,
  type RegisterFromInvitationInput,
} from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import { AuditService } from '../audit/audit.service';
import { generateSecureToken, hashToken } from '../common/crypto.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly env: EnvService,
    private readonly audit: AuditService,
  ) {}

  async login(raw: LoginInput) {
    const input = loginSchema.parse(raw);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    });

    if (!user?.passwordHash || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user.id, user.email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      outcome: 'SUCCESS',
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles.map((r) => r.role.code),
      },
    };
  }

  async registerFromInvitation(raw: RegisterFromInvitationInput) {
    const input = registerFromInvitationSchema.parse(raw);
    const tokenHash = hashToken(input.token);

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
      });

      if (!invitation) {
        throw new BadRequestException('Invalid invitation');
      }
      if (invitation.status === 'REVOKED') {
        throw new BadRequestException('Invitation revoked');
      }
      if (invitation.status === 'ACCEPTED') {
        throw new BadRequestException('Invitation already used');
      }
      if (invitation.expiresAt.getTime() < Date.now()) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
        throw new BadRequestException('Invitation expired');
      }

      const passwordHash = await bcrypt.hash(
        input.password,
        this.env.bcryptCost,
      );

      const existing = await tx.user.findUnique({
        where: { email: invitation.email.toLowerCase() },
      });

      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: invitation.email.toLowerCase(),
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            status: 'ACTIVE',
          },
        }));

      if (existing) {
        if (existing.status === 'ACTIVE' && existing.passwordHash) {
          throw new BadRequestException('Account already registered');
        }
        await tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            status: 'ACTIVE',
          },
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: invitation.roleId },
        },
        create: { userId: user.id, roleId: invitation.roleId },
        update: {},
      });

      await tx.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: user.id,
          isPrimary: true,
        },
        update: {},
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedById: user.id,
          tokenHash: hashToken(generateSecureToken()),
        },
      });

      await this.audit.record({
        actorId: user.id,
        action: 'auth.register_invitation',
        entityType: 'Invitation',
        entityId: invitation.id,
        outcome: 'SUCCESS',
      });

      const tokens = await this.issueTokens(user.id, user.email);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: input.firstName,
          lastName: input.lastName,
        },
      };
    });
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() < Date.now() ||
      stored.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.user.id, stored.user.email);
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  private async issueTokens(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.env.jwtAccessSecret,
        expiresIn: this.env.jwtAccessTtl as `${number}m`,
      },
    );
    const refreshToken = generateSecureToken(48);
    const refreshHash = hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + this.parseTtlMs(this.env.jwtRefreshTtl),
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshHash,
        expiresAt,
      },
    });
    return { accessToken, refreshToken };
  }

  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }
    const value = Number(match[1]);
    const unit = match[2];
    const mult =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : 86_400_000;
    return value * mult;
  }
}
