import amqp, { Channel, ConsumeMessage } from 'amqplib';
import { Prisma, PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pino from 'pino';
import { z } from 'zod';

function loadEnvFiles() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/worker/.env'),
    resolve(process.cwd(), '../../.env'),
  ];
  for (const file of [...new Set(candidates)]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnvFiles();

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { singleLine: true } }
      : undefined,
});

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  RABBITMQ_PREFETCH: z.coerce.number().default(10),
});

const prisma = new PrismaClient();

const MAX_ATTEMPTS = 5;

async function recordJob(
  jobType: string,
  queueName: string,
  idempotencyKey: string,
  payload: unknown,
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DEAD_LETTERED',
  error?: string,
) {
  await prisma.jobExecutionRecord.upsert({
    where: { idempotencyKey },
    create: {
      jobType,
      queueName,
      idempotencyKey,
      status,
      payload: payload as object,
      attempts: 1,
      maxAttempts: MAX_ATTEMPTS,
      lastError: error,
      startedAt: status === 'RUNNING' ? new Date() : undefined,
      finishedAt:
        status === 'SUCCEEDED' || status === 'FAILED' || status === 'DEAD_LETTERED'
          ? new Date()
          : undefined,
    },
    update: {
      status,
      attempts: { increment: 1 },
      lastError: error,
      finishedAt:
        status === 'SUCCEEDED' || status === 'FAILED' || status === 'DEAD_LETTERED'
          ? new Date()
          : undefined,
      startedAt: status === 'RUNNING' ? new Date() : undefined,
    },
  });
}

async function handleMessage(
  queue: string,
  msg: ConsumeMessage,
  channel: Channel,
) {
  const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
  const messageId =
    msg.properties.messageId ??
    `${queue}:${JSON.stringify(content).slice(0, 64)}`;

  const existing = await prisma.jobExecutionRecord.findUnique({
    where: { idempotencyKey: messageId },
  });
  if (existing?.status === 'SUCCEEDED') {
    channel.ack(msg);
    return;
  }

  try {
    await recordJob(queue, queue, messageId, content, 'RUNNING');

    if (queue === 'em.invitations' || content.email) {
      await handleInvitation(content);
    } else if (queue === 'em.notifications' || queue === 'em.reports') {
      await handleNotification(content);
    } else if (queue === 'em.profile') {
      await handleProfile(content);
    } else if (queue === 'em.documents') {
      await handleDocument(content);
    } else if (queue === 'em.matchmaking') {
      logger.info({ content }, 'Matchmaking event received (API also processes runs)');
    } else {
      logger.info({ queue, content }, 'Generic event consumed');
    }

    await recordJob(queue, queue, messageId, content, 'SUCCEEDED');
    channel.ack(msg);
  } catch (err) {
    const attempts = (existing?.attempts ?? 0) + 1;
    const error = (err as Error).message;
    logger.error({ err, queue, messageId }, 'Job failed');

    if (attempts >= MAX_ATTEMPTS) {
      await recordJob(queue, queue, messageId, content, 'DEAD_LETTERED', error);
      channel.nack(msg, false, false);
    } else {
      await recordJob(queue, queue, messageId, content, 'FAILED', error);
      // Bounded retry with requeue; DLX handles poison after broker retries if configured
      setTimeout(() => {
        channel.nack(msg, false, true);
      }, Math.min(30_000, 500 * 2 ** attempts + Math.random() * 250));
    }
  }
}

async function handleInvitation(content: Record<string, unknown>) {
  const invitationId = String(content.invitationId ?? '');
  const email = String(content.email ?? '');
  if (!invitationId || !email) {
    return;
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });
  if (!invitation || invitation.status === 'ACCEPTED') {
    return;
  }

  // Console/email adapter — production swaps SendGrid/SMTP via EMAIL_PROVIDER
  logger.info(
    {
      to: email,
      registrationUrl: content.registrationUrl,
      organizationName: content.organizationName,
    },
    'Invitation email dispatched (console provider)',
  );

  await prisma.notificationEvent.create({
    data: {
      templateCode: 'invitation',
      recipientEmail: email,
      payload: content as object,
      idempotencyKey: `invitation.email:${invitationId}`,
      deliveries: {
        create: {
          status: 'SENT',
          provider: process.env.EMAIL_PROVIDER ?? 'console',
          attempt: 1,
          sentAt: new Date(),
          providerResponse: { mode: 'console' },
        },
      },
    },
  });

  const prior = Array.isArray(invitation.deliveryHistory)
    ? (invitation.deliveryHistory as Prisma.JsonArray)
    : [];
  await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      status: 'SENT',
      deliveryHistory: [
        ...prior,
        { at: new Date().toISOString(), status: 'SENT', provider: 'console' },
      ] satisfies Prisma.InputJsonValue,
    },
  });
}

async function handleNotification(content: Record<string, unknown>) {
  logger.info({ content }, 'Notification event processed');
  const email = String(content.email ?? content.recipientEmail ?? 'ops@example.com');
  await prisma.notificationEvent.create({
    data: {
      templateCode: String(content.templateCode ?? 'generic'),
      recipientEmail: email,
      payload: content as object,
      idempotencyKey: `notification:${JSON.stringify(content).slice(0, 80)}:${Date.now()}`,
      deliveries: {
        create: {
          status: 'SENT',
          provider: process.env.EMAIL_PROVIDER ?? 'console',
          attempt: 1,
          sentAt: new Date(),
        },
      },
    },
  });
}

async function handleProfile(content: Record<string, unknown>) {
  const submissionId = String(content.submissionId ?? '');
  if (!submissionId) return;
  logger.info({ submissionId }, 'Profile normalization event acknowledged');
}

async function handleDocument(content: Record<string, unknown>) {
  const documentId = String(content.documentId ?? '');
  if (!documentId) return;
  // Malware scanner hook: mark SKIPPED when no scanner is configured.
  await prisma.document.update({
    where: { id: documentId },
    data: {
      scanStatus: 'SKIPPED',
      metadata: {
        scanNote: 'No malware scanner configured; marked skipped',
      },
    },
  });
  logger.info({ documentId }, 'Document scan skipped (no scanner configured)');
}

async function main() {
  const env = envSchema.parse(process.env);
  await prisma.$connect();

  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.prefetch(env.RABBITMQ_PREFETCH);

  const queues = [
    'em.invitations',
    'em.notifications',
    'em.profile',
    'em.matchmaking',
    'em.reports',
    'em.documents',
  ];

  for (const queue of queues) {
    await channel.assertQueue(queue, { durable: true });
    await channel.consume(queue, (msg) => {
      if (!msg) return;
      void handleMessage(queue, msg, channel);
    });
    logger.info(`Consuming ${queue}`);
  }

  const shutdown = async () => {
    logger.info('Worker shutting down');
    await channel.close();
    await connection.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  logger.error(err, 'Worker failed to start');
  process.exit(1);
});
