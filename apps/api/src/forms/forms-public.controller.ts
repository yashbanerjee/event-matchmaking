import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FormsService } from './forms.service';

@ApiTags('form-corrections')
@Controller('public/form-corrections')
export class FormsPublicController {
  constructor(private readonly forms: FormsService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.forms.getCorrectionByToken(token);
  }

  @Post(':token')
  resubmit(
    @Param('token') token: string,
    @Body() body: { responses: Record<string, unknown> },
  ) {
    return this.forms.resubmitCorrection(token, body.responses ?? {});
  }
}
