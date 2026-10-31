import {
  Body,
  Controller,
  Delete,
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
    @Query('excludeRequestId') excludeRequestId?: string,
    @Query('fromOrgId') fromOrgId?: string,
    @Query('toOrgId') toOrgId?: string,
  ) {
    return this.places.available(new Date(startsAt), new Date(endsAt), {
      excludeRequestId: excludeRequestId || undefined,
      fromOrgId: fromOrgId || undefined,
      toOrgId: toOrgId || undefined,
    });
  }

  @Get('assignments')
  @RequirePermissions(PERMISSIONS.MEETINGS_READ)
  listAssignments(
    @Query('organizationId') organizationId?: string,
    @Query('placeId') placeId?: string,
  ) {
    return this.places.listAssignments({
      organizationId: organizationId || undefined,
      placeId: placeId || undefined,
    });
  }

  @Post('assignments')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  createAssignments(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      organizationId: string;
      placeId: string;
      dates?: string[];
      date?: string;
      startTime?: string;
      endTime?: string;
      allDay?: boolean;
      note?: string;
    },
  ) {
    return this.places.createAssignments(user, body);
  }

  @Delete('assignments/:id')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  removeAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.places.removeAssignment(user, id);
  }

  @Get('map-search')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  mapSearch(@Query('q') q?: string) {
    return this.places.searchMap(q ?? '');
  }

  @Get('map-reverse')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  mapReverse(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.places.reverseGeocode(Number(lat), Number(lng));
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
      latitude?: number | null;
      longitude?: number | null;
      mapAddress?: string | null;
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
      code?: string;
      description?: string | null;
      capacity?: number | null;
      location?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      mapAddress?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.places.update(user, id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.places.remove(user, id);
  }
}
