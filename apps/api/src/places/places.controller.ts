import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import { PlacesService } from './places.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('places')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  list(@Query('activeOnly') activeOnly?: string) {
    return this.places.list({
      activeOnly: activeOnly === '1' || activeOnly === 'true',
    });
  }

  @Get('available')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  available(
    @Query('startsAt') startsAt: string,
    @Query('endsAt') endsAt: string,
  ) {
    return this.places.available(new Date(startsAt), new Date(endsAt));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      name: string;
      code?: string;
      description?: string;
      capacity?: number;
      location?: string;
    },
  ) {
    return this.places.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      capacity?: number | null;
      location?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.places.update(user, id, body);
  }
}
