import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RegistrationService } from './registration.service';

@ApiTags('registration')
@Controller('registration')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Get('event')
  getEvent() {
    return this.registration.getPublicConfig();
  }

  @Post('event/start')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  start(
    @Body()
    body: {
      email: string;
      role: 'CLIENT' | 'GUEST';
      organizationName: string;
      responses?: Record<string, unknown>;
    },
  ) {
    return this.registration.start({
      ...body,
      responses: body.responses ?? {},
    });
  }

  @Post('event/verify-otp')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verifyOtp(@Body() body: { registrationId: string; otp: string }) {
    return this.registration.verifyOtp(body);
  }

  @Post('event/complete')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  complete(
    @Body()
    body: {
      registrationToken: string;
      password: string;
      firstName: string;
      lastName: string;
    },
  ) {
    return this.registration.complete(body);
  }
}
