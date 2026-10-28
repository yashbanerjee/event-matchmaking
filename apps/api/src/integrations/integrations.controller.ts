import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import { RequirePermissions } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AiService } from './ai/ai.service';
import { EmailService } from './email/email.service';
import { StorageService } from './storage/storage.service';
import { SemanticSearchService } from './search/semantic-search.service';
import { EffectiveConfigService } from '../settings/effective-config.service';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly ai: AiService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
    private readonly search: SemanticSearchService,
    private readonly config: EffectiveConfigService,
  ) {}

  @Get('health')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
  async health() {
    const [ai, emailProvider, storageProvider, aiEnabled, semanticSearchEnabled] =
      await Promise.all([
        this.ai.health(),
        this.email.getProviderName(),
        this.storage.getProviderName(),
        this.ai.isEnabled(),
        this.config.getBoolean('ops.semanticSearch', false),
      ]);
    return {
      emailProvider,
      storageProvider,
      aiEnabled,
      semanticSearchEnabled,
      ai,
    };
  }

  @Get('search/vendors')
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  searchVendors(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.search.searchVendors({
      query: q ?? '',
      limit: limit ? Number(limit) : 20,
    });
  }
}
