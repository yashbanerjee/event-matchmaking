import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { renderMeetingReminderEmail } from '@em/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email/email.service';
import { EnvService } from '../config/env.service';
import { MeetingRequestsService } from './meeting-requests.service';

const REMINDER_MINUTES = 30;
/** Poll window around the 30-minute mark so a 60s ticker cannot miss a meeting. */
const WINDOW_BEFORE_MIN = 25;
const WINDOW_AFTER_MIN = 35;
const POLL_MS = 60_000;

@Injectable()
export class MeetingReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly env: EnvService,
    private readonly meetingRequests: MeetingRequestsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
    // First pass shortly after boot so reminders are not delayed a full minute.
    setTimeout(() => void this.tick(), 5_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.meetingRequests.expireStaleMeetNowRequests();
      await this.sendDueReminders();
    } catch (err) {
      this.logger.warn(
        `Meeting reminder tick failed: ${(err as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }

  async sendDueReminders() {
    const now = Date.now();
    const windowStart = new Date(now + WINDOW_BEFORE_MIN * 60_000);
    const windowEnd = new Date(now + WINDOW_AFTER_MIN * 60_000);

    const meetings = await this.prisma.meeting.findMany({
      where: {
        status: 'CONFIRMED',
        startsAt: { gte: windowStart, lte: windowEnd },
      },
      include: {
        place: { select: { name: true, location: true } },
        companyOrg: {
          include: {
            invitations: {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: { email: true },
            },
            members: {
              include: { user: { select: { id: true, email: true } } },
            },
          },
        },
        vendorOrg: {
          include: {
            invitations: {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: { email: true },
            },
            members: {
              include: { user: { select: { id: true, email: true } } },
            },
          },
        },
      },
      take: 100,
      orderBy: { startsAt: 'asc' },
    });

    for (const meeting of meetings) {
      await this.remindMeeting(meeting);
    }
  }

  private async remindMeeting(meeting: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    durationMinutes: number;
    version: number;
    place: { name: string; location: string | null } | null;
    companyOrg: {
      id: string;
      name: string;
      type: string;
      customAttrs: unknown;
      invitations: Array<{ email: string }>;
      members: Array<{ user: { id: string; email: string } }>;
    };
    vendorOrg: {
      id: string;
      name: string;
      type: string;
      customAttrs: unknown;
      invitations: Array<{ email: string }>;
      members: Array<{ user: { id: string; email: string } }>;
    };
  }) {
    const claimKey = `meeting.reminder.30m:${meeting.id}:${meeting.startsAt.toISOString()}`;
    try {
      await this.prisma.notificationEvent.create({
        data: {
          templateCode: 'meeting_reminder_30m',
          recipientEmail: `meeting:${meeting.id}`,
          payload: {
            meetingId: meeting.id,
            startsAt: meeting.startsAt.toISOString(),
            minutesBefore: REMINDER_MINUTES,
          },
          idempotencyKey: claimKey,
        },
      });
    } catch {
      // Unique idempotency key — reminder already claimed/sent for this start time.
      return;
    }

    const fromName = await this.email.getFromName();
    const baseUrl = this.env.appUrl.replace(/\/$/, '');

    const sides: Array<{
      audience: 'company' | 'vendor';
      org: typeof meeting.companyOrg;
      meetingsPath: string;
    }> = [
      {
        audience: 'company',
        org: meeting.companyOrg,
        meetingsPath: `${baseUrl}/portal/meetings`,
      },
      {
        audience: 'vendor',
        org: meeting.vendorOrg,
        meetingsPath: `${baseUrl}/vendor/meetings`,
      },
    ];

    for (const side of sides) {
      const emails = this.resolveOrgEmails(side.org);
      const template = renderMeetingReminderEmail({
        brandName: fromName,
        audience: side.audience,
        companyName: meeting.companyOrg.name,
        vendorName: meeting.vendorOrg.name,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        durationMinutes: meeting.durationMinutes,
        placeName: meeting.place?.name,
        placeLocation: meeting.place?.location,
        minutesBefore: REMINDER_MINUTES,
        portalUrl: side.meetingsPath,
      });

      for (const to of emails) {
        try {
          await this.email.send({
            to,
            subject: template.subject,
            text: template.text,
            html: template.html,
            idempotencyKey: `${claimKey}:${side.audience}:${to}`,
            templateCode: 'meeting_reminder_30m',
          });
        } catch (err) {
          this.logger.warn(
            `Meeting reminder email failed (${to}): ${(err as Error).message}`,
          );
        }
      }

      const title = `Meeting in ${REMINDER_MINUTES} minutes`;
      const body = `${meeting.companyOrg.name} ↔ ${meeting.vendorOrg.name} starts soon.`;
      for (const member of side.org.members) {
        const subs = await this.prisma.pushSubscription.findMany({
          where: { userId: member.user.id },
        });
        for (const sub of subs) {
          try {
            await this.prisma.notificationEvent.create({
              data: {
                templateCode: 'push.meeting_reminder_30m',
                recipientEmail: `user:${member.user.id}`,
                recipientUserId: member.user.id,
                payload: {
                  title,
                  body,
                  url: side.meetingsPath,
                  meetingId: meeting.id,
                  startsAt: meeting.startsAt.toISOString(),
                  endpoint: sub.endpoint,
                },
                idempotencyKey: `${claimKey}:push:${sub.id}`,
              },
            });
          } catch {
            // Already recorded for this subscription.
          }
        }
      }
    }

    this.logger.log(
      `Sent 30-min reminder for meeting ${meeting.id} (${meeting.companyOrg.name} ↔ ${meeting.vendorOrg.name})`,
    );
  }

  private resolveOrgEmails(org: {
    customAttrs: unknown;
    invitations: Array<{ email: string }>;
    members: Array<{ user: { email: string } }>;
  }): string[] {
    const emails = new Set<string>();
    const attrs =
      org.customAttrs && typeof org.customAttrs === 'object'
        ? (org.customAttrs as Record<string, unknown>)
        : {};
    if (typeof attrs.contactEmail === 'string' && attrs.contactEmail.trim()) {
      emails.add(attrs.contactEmail.trim().toLowerCase());
    }
    for (const invite of org.invitations) {
      if (invite.email?.trim()) emails.add(invite.email.trim().toLowerCase());
    }
    for (const member of org.members) {
      if (member.user.email?.trim()) {
        emails.add(member.user.email.trim().toLowerCase());
      }
    }
    return [...emails];
  }
}
