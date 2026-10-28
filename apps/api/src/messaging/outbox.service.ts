import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    input: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: unknown;
      idempotencyKey: string;
    },
  ) {
    return tx.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }
}
