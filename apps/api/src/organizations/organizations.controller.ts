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
import { OrganizationType } from '@prisma/client';
import { PERMISSIONS } from '@em/shared';
import { OrganizationsService } from './organizations.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post('companies')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  createCompany(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      code: string;
      name: string;
      industry?: string;
      country?: string;
      region?: string;
      website?: string;
      timeZone?: string;
    },
  ) {
    return this.orgs.createCompany(user, body);
  }

  @Post('vendors')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  createVendor(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      code: string;
      name: string;
      displayName?: string;
      industry?: string;
      country?: string;
      categories?: string[];
      capabilities?: string[];
    },
  ) {
    return this.orgs.createVendor(user, body);
  }

  @Post('vendors/invite')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  inviteVendor(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      name: string;
      email: string;
      phone?: string;
      phoneCountryCode?: string;
      formId?: string;
      formVersionId?: string;
      code?: string;
    },
  ) {
    return this.orgs.inviteVendor(user, body);
  }

  @Post('vendors/import-csv')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  importVendorsCsv(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      rows: Array<{
        name: string;
        email: string;
        phone?: string;
        phoneCountryCode?: string;
        formId?: string;
        formVersionId?: string;
        code?: string;
      }>;
    },
  ) {
    return this.orgs.inviteVendorsCsv(user, body.rows ?? []);
  }

  @Post('vendors/:id/approve')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orgs.approveVendor(user, id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  list(
    @Query('type') type?: OrganizationType,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.orgs.list({
      type,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      q,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  get(@Param('id') id: string) {
    return this.orgs.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      industry?: string | null;
      country?: string | null;
      region?: string | null;
      website?: string | null;
      address?: string | null;
      timeZone?: string;
      status?: string;
      displayName?: string;
      categories?: string[];
      capabilities?: string[];
    },
  ) {
    return this.orgs.update(user, id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orgs.remove(user, id);
  }

}
