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
import { FiltersService } from './filters.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('filters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('filters')
export class FiltersController {
  constructor(private readonly filters: FiltersService) {}

  @Get('dimensions')
  @RequirePermissions(PERMISSIONS.FORMS_READ)
  listDimensions(@Query('activeOnly') activeOnly?: string) {
    return this.filters.listDimensions({
      activeOnly: activeOnly === '1' || activeOnly === 'true',
    });
  }

  @Post('dimensions')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  createDimension(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      name: string;
      code?: string;
      description?: string;
      profileKey?: string;
    },
  ) {
    return this.filters.createDimension(user, body);
  }

  @Patch('dimensions/:id')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  updateDimension(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      profileKey?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.filters.updateDimension(user, id, body);
  }

  @Get('dimensions/:id/options')
  @RequirePermissions(PERMISSIONS.FORMS_READ)
  options(@Param('id') id: string) {
    return this.filters.optionsForDimension(id);
  }

  @Post('dimensions/:id/tags')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  createTag(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { label: string; value?: string },
  ) {
    return this.filters.createTag(user, id, body);
  }

  @Patch('tags/:id')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  updateTag(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      label?: string;
      value?: string;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.filters.updateTag(user, id, body);
  }

  @Delete('tags/:id')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  deleteTag(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.filters.deleteTag(user, id);
  }

  @Get('mappings')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  listMappings() {
    return this.filters.listMappings();
  }

  @Post('mappings')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  createMapping(
    @CurrentUser() user: AuthUser,
    @Body()
    body: { fromTagId: string; toTagId: string; bidirectional?: boolean },
  ) {
    return this.filters.createMapping(user, body);
  }

  @Delete('mappings/:id')
  @RequirePermissions(PERMISSIONS.MATCHING_CONFIGURE)
  deleteMapping(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.filters.deleteMapping(user, id);
  }
}
