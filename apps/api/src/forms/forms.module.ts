import { Module, forwardRef } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { FormsPublicController } from './forms-public.controller';
import { FormsService } from './forms.service';
import { MeetingsModule } from '../meetings/meetings.module';

@Module({
  imports: [forwardRef(() => MeetingsModule)],
  controllers: [FormsController, FormsPublicController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}