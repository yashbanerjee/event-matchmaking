import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnvService } from '../config/env.service';
import { RecommendationsService } from './recommendations.service';
import type { AuthUser } from '../common/decorators';

export type QrRelationship =
  | 'NONE'
  | 'OPEN_REQUEST'
  | 'SCHEDULED'
  | 'SELF'
  | 'INVALID'
  | 'SAME_TYPE';

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly recommendations: RecommendationsService,
  ) {}

  private deepLinkForCode(code: string) {
    const base = String(this.env.appUrl || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    return `${base}/qr/${encodeURIComponent(code)}`;
  }

  private mobileLinkForCode(code: string) {
    return `ethara://qr/${encodeURIComponent(code)}`;
  }

  private extractCode(input: { code?: string; url?: string }): string {
    const raw = (input.code ?? input.url ?? '').trim();
    if (!raw) {
      throw new BadRequestException('Provide a QR code or URL');
    }

    // Accept bare codes, web URLs, or ethara:// deep links.
    try {
      if (raw.includes('://') || raw.startsWith('http')) {
        const normalized = raw.startsWith('ethara://')
          ? raw.replace('ethara://', 'https://ethara.local/')
          : raw;
        const url = new URL(normalized);
        const parts = url.pathname.split('/').filter(Boolean);
        const qrIndex = parts.findIndex((p) => p.toLowerCase() === 'qr');
        const qrCode = qrIndex >= 0 ? parts[qrIndex + 1] : undefined;
        if (qrCode) {
          return decodeURIComponent(qrCode).trim();
        }
      }
    } catch {
      // fall through to bare code
    }

    const bare = raw.replace(/^\/+/, '').replace(/^qr\//i, '').trim();
    if (!bare || bare.length > 80) {
      throw new BadRequestException('Invalid QR payload');
    }
    return bare;
  }

  async myQr(actor: AuthUser) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) {
      throw new ForbiddenException('Organization membership required');
    }

    const org = await this.prisma.organization.findFirst({
      where: {
        id: { in: orgIds },
        status: { not: 'ARCHIVED' },
        type: { in: ['COMPANY', 'VENDOR'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!org) {
      throw new NotFoundException(
        'No client or guest organization found for this account. QR codes are only available for meeting profiles.',
      );
    }
    if (!org.code?.trim()) {
      throw new BadRequestException(
        'Your organization is missing a QR code. Ask an admin to set the organization code.',
      );
    }

    const deepLink = this.deepLinkForCode(org.code);
    const mobileLink = this.mobileLinkForCode(org.code);

    // Generate PNG on the server so the portal does not depend on browser
    // bundling of the `qrcode` package (a common Next.js client failure mode).
    let pngDataUrl: string | null = null;
    try {
      const QRCode = await import('qrcode');
      pngDataUrl = await QRCode.toDataURL(deepLink, {
        width: 512,
        margin: 2,
        color: { dark: '#0a0a0a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
    } catch {
      pngDataUrl = null;
    }

    return {
      organizationId: org.id,
      code: org.code,
      name: org.name,
      type: org.type,
      deepLink,
      mobileLink,
      pngDataUrl,
    };
  }

  async resolve(actor: AuthUser, input: { code?: string; url?: string }) {
    const orgIds = actor.organizationIds ?? [];
    if (!orgIds.length) {
      throw new ForbiddenException('Organization membership required');
    }

    const code = this.extractCode(input);
    const target = await this.prisma.organization.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        status: { not: 'ARCHIVED' },
      },
      include: { company: true, vendor: true },
    });

    if (!target || !['COMPANY', 'VENDOR'].includes(target.type)) {
      return {
        relationship: 'INVALID' as QrRelationship,
        code,
        profile: null,
        openRequest: null,
        meeting: null,
        canBook: false,
        message: 'This QR code is not a valid Ethara meeting profile.',
      };
    }

    if (orgIds.includes(target.id)) {
      return {
        relationship: 'SELF' as QrRelationship,
        code: target.code,
        profile: {
          organizationId: target.id,
          name: target.name,
          type: target.type,
          industry: target.industry,
          region: target.region,
          website: target.website,
          logoUrl: null,
          categories: [],
          capabilities: [],
          featured: false,
          formName: null,
          fields: [],
          sensitiveFieldsHidden: true,
        },
        openRequest: null,
        meeting: null,
        canBook: false,
        message: 'This is your own QR code.',
        deepLink: this.deepLinkForCode(target.code),
      };
    }

    const myOrgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, type: true },
    });
    const myType = myOrgs.find((o) =>
      ['COMPANY', 'VENDOR'].includes(o.type),
    )?.type;
    if (
      !myType ||
      myType === target.type ||
      !['COMPANY', 'VENDOR'].includes(target.type)
    ) {
      return {
        relationship: 'SAME_TYPE' as QrRelationship,
        code: target.code,
        profile: await this.recommendations.publicProfile(actor, target.id),
        openRequest: null,
        meeting: null,
        canBook: false,
        message:
          'Meetings are between a client and a guest. This QR belongs to the same side as you.',
        deepLink: this.deepLinkForCode(target.code),
      };
    }

    const fromOrgId =
      myType === 'COMPANY'
        ? myOrgs.find((o) => o.type === 'COMPANY')!.id
        : myOrgs.find((o) => o.type === 'VENDOR')!.id;

    const openRequest = await this.prisma.meetingRequest.findFirst({
      where: {
        status: {
          in: ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'],
        },
        OR: [
          { fromOrgId, toOrgId: target.id },
          { fromOrgId: target.id, toOrgId: fromOrgId },
        ],
      },
      include: {
        place: { select: { id: true, name: true, location: true } },
        fromOrg: { select: { id: true, name: true } },
        toOrg: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const companyOrgId = myType === 'COMPANY' ? fromOrgId : target.id;
    const vendorOrgId = myType === 'VENDOR' ? fromOrgId : target.id;

    const meeting = await this.prisma.meeting.findFirst({
      where: {
        companyOrgId,
        vendorOrgId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: {
        place: { select: { id: true, name: true, location: true } },
        companyOrg: { select: { id: true, name: true } },
        vendorOrg: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: 'desc' },
    });

    const profile = await this.recommendations.publicProfile(actor, target.id);

    if (meeting) {
      return {
        relationship: 'SCHEDULED' as QrRelationship,
        code: target.code,
        profile,
        openRequest: null,
        meeting: {
          id: meeting.id,
          status: meeting.status,
          startsAt: meeting.startsAt,
          endsAt: meeting.endsAt,
          place: meeting.place
            ? {
                id: meeting.place.id,
                name: meeting.place.name,
                location: meeting.place.location,
              }
            : null,
          companyOrg: meeting.companyOrg,
          vendorOrg: meeting.vendorOrg,
        },
        canBook: false,
        fromOrgId,
        toOrgId: target.id,
        message: 'You already have a meeting with this partner.',
        deepLink: this.deepLinkForCode(target.code),
      };
    }

    if (openRequest) {
      return {
        relationship: 'OPEN_REQUEST' as QrRelationship,
        code: target.code,
        profile,
        openRequest: {
          id: openRequest.id,
          status: openRequest.status,
          proposedStartsAt: openRequest.proposedStartsAt,
          proposedEndsAt: openRequest.proposedEndsAt,
          place: openRequest.place,
          fromOrg: openRequest.fromOrg,
          toOrg: openRequest.toOrg,
        },
        meeting: null,
        canBook: false,
        fromOrgId,
        toOrgId: target.id,
        message: 'You already have an open meeting request with this partner.',
        deepLink: this.deepLinkForCode(target.code),
      };
    }

    return {
      relationship: 'NONE' as QrRelationship,
      code: target.code,
      profile,
      openRequest: null,
      meeting: null,
      canBook: true,
      fromOrgId,
      toOrgId: target.id,
      message: 'No meeting yet — pick a free time and place to request one.',
      deepLink: this.deepLinkForCode(target.code),
    };
  }
}
