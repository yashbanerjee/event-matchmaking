import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FieldType } from '@prisma/client';
import { PERMISSIONS } from '@em/shared';
import { FormsService } from './forms.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@ApiTags('forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FORMS_MANAGE)
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      code: string;
      name: string;
      description?: string;
      targetType?: 'COMPANY' | 'VENDOR' | 'PLATFORM';
      isTemplate?: boolean;
      fields?: Array<{
        fieldKey: string;
        label: string;
        description?: string;
        fieldType: FieldType;
        required?: boolean;
        displayOrder?: number;
        options?: unknown[];
      }>;
    },
  ) {
    return this.forms.createForm(user, body);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.FORMS_READ)
  list() {
    return this.forms.list();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FORMS_READ)
  get(@Param('id') id: string) {
    return this.forms.get(id);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.FORMS_MANAGE)
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.forms.publishVersion(user, id);
  }

  @Post(':id/new-version')
  @RequirePermissions(PERMISSIONS.FORMS_MANAGE)
  newVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.forms.duplicateAsNewVersion(user, id);
  }

  @Post('assignments')
  @RequirePermissions(PERMISSIONS.FORMS_MANAGE)
  assign(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      formId: string;
      formVersionId: string;
      organizationId: string;
      dueAt?: string;
    },
  ) {
    return this.forms.assignForm(user, body);
  }

  @Post('submissions')
  @RequirePermissions(PERMISSIONS.FORMS_READ)
  submit(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      formVersionId: string;
      organizationId: string;
      responses: Record<string, unknown>;
    },
  ) {
    return this.forms.submit(user, body);
  }
}
