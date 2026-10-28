import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { RabbitMqService } from './rabbitmq.service';
import { OutboxPublisherService } from './outbox-publisher.service';

@Global()
@Module({
  providers: [OutboxService, RabbitMqService, OutboxPublisherService],
  exports: [OutboxService, RabbitMqService, OutboxPublisherService],
})
export class MessagingModule {}
