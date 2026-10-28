import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@em/shared';
import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('upload')
  @RequirePermissions(PERMISSIONS.ORGS_MANAGE)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file: { originalname: string; mimetype: string; buffer: Buffer } | undefined,
    @Query('organizationId') organizationId: string,
  ) {
    if (!file) {
      throw new BadRequestException('file required');
    }
    if (!organizationId) {
      throw new BadRequestException('organizationId required');
    }
    return this.documents.upload(user, {
      organizationId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId: string,
  ) {
    return this.documents.list(user, organizationId);
  }

  @Get(':id/download-url')
  @RequirePermissions(PERMISSIONS.ORGS_READ)
  download(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.getDownloadUrl(user, id);
  }
}
